"""
LMS Homework Grader - Chấm bài tập về nhà
Tải file bài tập và chấm điểm tự động
"""

import requests
import json
import os
import sys
from urllib.parse import quote
from lms_api import LMSClient

sys.stdout.reconfigure(encoding='utf-8')

# Initialize client
client = LMSClient()

# API URLs
PRESIGNED_URL_API = "https://resources.mindx.edu.vn/api/v1/get-presigned-url"

# Queries
FIND_SUBMISSIONS_QUERY = """query FindStudentSubmissionByClass($payload: FindStudentSubmissionByClassQuery) {
  findStudentSubmissionByClass(payload: $payload) {
    students { id displayName studentUid }
    lessons { id name type isActive displayOrder }
    submissions {
      id type note score status category
      classId lessonId learningCourseId studentUid
      markedAt markedBy submittedAt submittedCount
      content { scratchState type attachments totalQuiz submitQuiz correctAnswer }
    }
  }
}"""

MARK_SUBMISSION_QUERY = """mutation MarkStudentSubmission($payload: MarkStudentSubmissionCommand!) {
  studentHomework {
    markStudentSubmission(payload: $payload) {
      id score status markedAt markedBy
    }
  }
}"""


def get_submissions(class_id):
    """Lấy danh sách submissions của lớp"""
    result = client.call_api('FindStudentSubmissionByClass', FIND_SUBMISSIONS_QUERY, {
        'payload': {'classId': class_id}
    })

    if 'error' in result or 'errors' in result:
        print(f"Error: {result}")
        return None

    return result.get('data', {}).get('findStudentSubmissionByClass', {})


def get_pending_submissions(class_id):
    """Lấy danh sách bài tập chờ chấm (SUBMITTED + UPLOAD_FILE)"""
    data = get_submissions(class_id)
    if not data:
        return [], [], []

    students = {s['studentUid']: s for s in data.get('students', [])}
    lessons = {l['id']: l for l in data.get('lessons', [])}
    submissions = data.get('submissions', [])

    # Filter: SUBMITTED + UPLOAD_FILE only
    pending = [
        s for s in submissions
        if s.get('status') == 'SUBMITTED' and s.get('type') == 'UPLOAD_FILE'
    ]

    return pending, students, lessons


def get_download_url(file_key):
    """Lấy presigned URL để tải file"""
    url = f"{PRESIGNED_URL_API}?key={quote(file_key, safe='')}"
    resp = requests.get(url)
    if resp.status_code == 200:
        data = resp.json()
        if data.get('success'):
            return data.get('url')
    return None


def download_file(file_key, save_dir="downloads"):
    """Tải file về thư mục local"""
    os.makedirs(save_dir, exist_ok=True)

    download_url = get_download_url(file_key)
    if not download_url:
        print(f"  Cannot get download URL for: {file_key}")
        return None

    # Extract filename from key
    filename = file_key.split('/')[-1]
    save_path = os.path.join(save_dir, filename)

    # Download
    resp = requests.get(download_url, stream=True)
    if resp.status_code == 200:
        with open(save_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return save_path

    print(f"  Download failed: {resp.status_code}")
    return None


def mark_submission(submission_id, score, note=""):
    """Chấm điểm bài tập"""
    payload = {
        'id': submission_id,
        'score': str(score)
    }
    if note:
        payload['note'] = note

    result = client.call_api('MarkStudentSubmission', MARK_SUBMISSION_QUERY, {
        'payload': payload
    })

    if 'data' in result:
        return True, result['data']['studentHomework']['markStudentSubmission']
    else:
        return False, result.get('errors', [{'message': 'Unknown error'}])[0]['message']


def list_pending(class_id):
    """Liệt kê tất cả bài tập chờ chấm"""
    pending, students, lessons = get_pending_submissions(class_id)

    if not pending:
        print("Không có bài tập nào chờ chấm!")
        return

    print(f"\n{'='*80}")
    print(f"DANH SÁCH BÀI TẬP CHỜ CHẤM: {len(pending)} bài")
    print(f"{'='*80}\n")

    # Group by lesson
    by_lesson = {}
    for s in pending:
        lesson_id = s.get('lessonId')
        if lesson_id not in by_lesson:
            by_lesson[lesson_id] = []
        by_lesson[lesson_id].append(s)

    for lesson_id, subs in by_lesson.items():
        lesson = lessons.get(lesson_id, {})
        print(f"\n📚 {lesson.get('name', 'Unknown Lesson')}")
        print("-" * 60)

        for s in subs:
            student = students.get(s['studentUid'], {})
            attachments = s.get('content', {}).get('attachments', [])
            files = [a.split('/')[-1] for a in attachments]

            print(f"  [{s['id'][:8]}...] {student.get('displayName', 'Unknown')}")
            print(f"      Files: {', '.join(files) if files else 'No files'}")
            print(f"      Submitted: {s.get('submittedAt', 'N/A')}")

    return pending, students, lessons


def download_all_pending(class_id, save_dir="downloads"):
    """Tải tất cả file bài tập chờ chấm"""
    pending, students, lessons = get_pending_submissions(class_id)

    if not pending:
        print("Không có bài tập nào chờ chấm!")
        return

    print(f"\nTải {len(pending)} bài tập...")

    downloaded = []
    for s in pending:
        student = students.get(s['studentUid'], {})
        lesson = lessons.get(s.get('lessonId'), {})
        attachments = s.get('content', {}).get('attachments', [])

        student_name = student.get('displayName', 'Unknown').replace(' ', '_')
        lesson_name = lesson.get('name', 'Unknown')[:30].replace(' ', '_')

        # Create subfolder for each submission
        sub_dir = os.path.join(save_dir, f"{lesson_name}", student_name)
        os.makedirs(sub_dir, exist_ok=True)

        for attachment in attachments:
            print(f"  Downloading: {student.get('displayName')} - {attachment.split('/')[-1]}")
            path = download_file(attachment, sub_dir)
            if path:
                downloaded.append({
                    'submission_id': s['id'],
                    'student': student.get('displayName'),
                    'lesson': lesson.get('name'),
                    'file': path
                })

    print(f"\n✅ Đã tải {len(downloaded)} files vào thư mục '{save_dir}'")
    return downloaded


def grade_interactive(class_id):
    """Chấm bài tương tác từng bài một"""
    pending, students, lessons = get_pending_submissions(class_id)

    if not pending:
        print("Không có bài tập nào chờ chấm!")
        return

    print(f"\nBắt đầu chấm {len(pending)} bài tập...")
    print("Nhập điểm (0-100), 's' để skip, 'q' để thoát\n")

    graded = 0
    for i, s in enumerate(pending):
        student = students.get(s['studentUid'], {})
        lesson = lessons.get(s.get('lessonId'), {})
        attachments = s.get('content', {}).get('attachments', [])

        print(f"\n[{i+1}/{len(pending)}] {student.get('displayName', 'Unknown')}")
        print(f"    Bài: {lesson.get('name', 'Unknown')}")
        print(f"    Files: {[a.split('/')[-1] for a in attachments]}")

        # Show download links
        for att in attachments:
            url = get_download_url(att)
            if url:
                print(f"    📥 {url[:80]}...")

        while True:
            score_input = input("    Điểm: ").strip()

            if score_input.lower() == 'q':
                print(f"\n✅ Đã chấm {graded} bài")
                return

            if score_input.lower() == 's':
                print("    ⏭️ Skipped")
                break

            try:
                score = int(score_input)
                if 0 <= score <= 100:
                    success, result = mark_submission(s['id'], score)
                    if success:
                        print(f"    ✅ Đã chấm {score} điểm")
                        graded += 1
                    else:
                        print(f"    ❌ Lỗi: {result}")
                    break
                else:
                    print("    Điểm phải từ 0-100!")
            except ValueError:
                print("    Nhập số hoặc 's' (skip) hoặc 'q' (quit)")

    print(f"\n✅ Hoàn thành! Đã chấm {graded}/{len(pending)} bài")


def grade_batch(class_id, score, lesson_filter=None):
    """Chấm hàng loạt với cùng một điểm"""
    pending, students, lessons = get_pending_submissions(class_id)

    if lesson_filter:
        pending = [s for s in pending if lesson_filter.lower() in lessons.get(s['lessonId'], {}).get('name', '').lower()]

    if not pending:
        print("Không có bài tập phù hợp!")
        return

    print(f"\nChấm {len(pending)} bài với điểm {score}...")
    confirm = input("Xác nhận? (y/n): ")

    if confirm.lower() != 'y':
        print("Đã hủy")
        return

    graded = 0
    for s in pending:
        student = students.get(s['studentUid'], {})
        success, _ = mark_submission(s['id'], score)
        if success:
            print(f"  ✅ {student.get('displayName')}: {score} điểm")
            graded += 1
        else:
            print(f"  ❌ {student.get('displayName')}: Lỗi")

    print(f"\n✅ Đã chấm {graded}/{len(pending)} bài")


if __name__ == "__main__":
    # Default class ID
    CLASS_ID = "6901ba9fb1c78219a23f0c34"

    print("="*60)
    print("LMS HOMEWORK GRADER")
    print("="*60)

    if len(sys.argv) < 2:
        print("""
Sử dụng:
  python homework_grader.py list              - Xem danh sách bài chờ chấm
  python homework_grader.py download          - Tải tất cả bài tập về
  python homework_grader.py grade             - Chấm bài tương tác
  python homework_grader.py batch <score>     - Chấm hàng loạt với cùng điểm
  python homework_grader.py batch <score> <lesson> - Chấm theo bài học
        """)
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == "list":
        list_pending(CLASS_ID)

    elif cmd == "download":
        download_all_pending(CLASS_ID)

    elif cmd == "grade":
        grade_interactive(CLASS_ID)

    elif cmd == "batch":
        if len(sys.argv) < 3:
            print("Cần nhập điểm! VD: python homework_grader.py batch 100")
        else:
            score = int(sys.argv[2])
            lesson = sys.argv[3] if len(sys.argv) > 3 else None
            grade_batch(CLASS_ID, score, lesson)

    else:
        print(f"Lệnh không hợp lệ: {cmd}")
