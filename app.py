"""
LMS Auto Comment Tool - Web Interface
Tự động nhận xét học sinh bằng AI dựa vào lịch sử + notes
"""

from flask import Flask, render_template, request, jsonify
import requests
import json
import os
import base64
from datetime import datetime, timedelta
import boto3
from lms_api import LMSClient

# Initialize Flask app
app = Flask(__name__)

# Initialize LMS client
lms_client = LMSClient()

# Config file path
CONFIG_FILE = "config.json"

def load_config():
    """Load config from file"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_config(config):
    """Save config to file"""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

# Notes file path
NOTES_FILE = "student_notes.json"

def load_notes():
    """Load student notes from file"""
    if os.path.exists(NOTES_FILE):
        try:
            with open(NOTES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_notes(notes):
    """Save student notes to file"""
    with open(NOTES_FILE, 'w', encoding='utf-8') as f:
        json.dump(notes, f, ensure_ascii=False, indent=2)

# Comment areas for LMS (standard MindX comment structure)
COMMENT_AREAS = [
    {"id": "672f0f7b0b00b07cb06e54bb", "name": "Kỹ năng COD", "type": "RATE"},
    {"id": "672f0f7b0b00b07cb06e54bc", "name": "Đánh giá chung", "type": "CONTENT"}
]

# Default rate contents for each area
RATE_CONTENTS = {
    "672f0f7b0b00b07cb06e54bb": "Tốt"  # Kỹ năng COD mặc định là Tốt
}

AI_MODELS = [
    # Antigravity Models (CLI-Proxy)
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "antigravity"},
    {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite", "provider": "antigravity"},
    {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash Preview", "provider": "antigravity"},
    {"id": "gemini-3-pro-preview", "name": "Gemini 3 Pro Preview", "provider": "antigravity"},
    {"id": "gemini-3-pro-image-preview", "name": "Gemini 3 Pro Image Preview", "provider": "antigravity"},
    {"id": "gemini-claude-sonnet-4-5", "name": "Claude Sonnet 4.5 (via Gemini)", "provider": "antigravity"},
    {"id": "gemini-claude-sonnet-4-5-thinking", "name": "Claude Sonnet 4.5 Thinking (via Gemini)", "provider": "antigravity"},
    {"id": "gemini-claude-opus-4-5-thinking", "name": "Claude Opus 4.5 Thinking (via Gemini)", "provider": "antigravity"},
    {"id": "gpt-oss-120b-medium", "name": "GPT OSS 120B Medium", "provider": "antigravity"},
    # OpenRouter Models
    {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash (OpenRouter)", "provider": "openrouter"},
    {"id": "google/gemini-3-flash-preview", "name": "Gemini 3 Flash Preview (OpenRouter)", "provider": "openrouter"},
    {"id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2 (OpenRouter)", "provider": "openrouter"},
    {"id": "x-ai/grok-code-fast-1", "name": "Grok Code Fast (OpenRouter)", "provider": "openrouter"},
]

ANTIGRAVITY_API_URL = "http://13.250.104.165:8317/v1/chat/completions"

def call_antigravity_api(prompt, model_id):
    """Call Antigravity/CLI-Proxy API"""
    try:
        resp = requests.post(
            ANTIGRAVITY_API_URL,
            headers={"Content-Type": "application/json"},
            json={
                "model": model_id,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=120
        )
        
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            return content, None
        else:
            return None, resp.text[:100] if resp.text else str(resp.status_code)
    except Exception as e:
        return None, str(e)

def call_openrouter_api(prompt, model_id, api_key):
    """Call OpenRouter API"""
    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://mindx.edu.vn",
                "X-Title": "LMS Auto Comment"
            },
            json={
                "model": model_id,
                "messages": [{"role": "user", "content": prompt}],
                "provider": {
                    "data_collection": "allow"
                }
            },
            timeout=60
        )
        
        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            return content, None
        else:
            return None, resp.text[:100] if resp.text else str(resp.status_code)
    except Exception as e:
        return None, str(e)


def get_model_provider(model_id):
    """Get provider for a model"""
    for m in AI_MODELS:
        if m['id'] == model_id:
            return m.get('provider', 'openrouter')
    return 'openrouter'

def generate_comment_with_ai(api_key, student_name, past_comments, notes, session_summary, model_id=None, comment_length='medium', custom_prompt=''):
    """Generate comment using AI (OpenRouter or Antigravity)"""
    
    config = load_config()
    # Prioritize passed model_id, then custom_model_id from config, then selected ai_model
    model = model_id or config.get('custom_model_id') or config.get('ai_model', 'gemini-3-flash')
    
    # Lấy tên gọi ngắn (tên cuối)
    short_name = student_name.split()[-1] if student_name else "em"
    
    # Độ dài nhận xét
    length_guide = {
        'short': '2-3 câu ngắn gọn',
        'medium': '3-4 câu',
        'long': '4-5 câu chi tiết'
    }.get(comment_length, '3-4 câu')
    
    prompt = f"""Bạn là giáo viên lập trình tại MindX Technology School. Viết nhận xét cho học sinh gửi phụ huynh.

Tên học sinh: {student_name} (gọi tắt: {short_name})

Nội dung buổi học hôm nay: {session_summary or 'Thực hành lập trình'}

Nhận xét các buổi trước:
{past_comments if past_comments else 'Buổi đầu tiên'}

Ghi chú của thầy về học sinh buổi này:
{notes if notes else 'Không có ghi chú đặc biệt'}

YÊU CẦU VIẾT NHẬN XÉT:
1. Viết {length_guide}, tự nhiên như giáo viên thật sự viết
2. Đề cập các khía cạnh: đi học đúng giờ/muộn, tập trung trong lớp, thao tác lập trình, hoàn thành BTVN
3. Nếu có ghi chú tiêu cực (hay chơi game, nói chuyện riêng...) thì nhắc nhở nhẹ nhàng
4. Nếu có ghi chú tích cực (tập trung, làm bài nhanh...) thì khen ngợi
5. Kết thúc bằng lời động viên hoặc nhắc nhở phù hợp
6. Dùng "em" hoặc tên ngắn ({short_name}) để gọi học sinh
7. Giọng văn thân thiện, chuyên nghiệp, không sáo rỗng
{f"8. YÊU CẦU BỔ SUNG: {custom_prompt}" if custom_prompt else ""}

VÍ DỤ NHẬN XÉT TỐT:
- "Buổi hôm nay {short_name} đến lớp đúng giờ, tuân thủ tốt nội quy lớp học. Quá trình học em luôn tập trung nghe giảng, thao tác lập trình nhanh chóng, không gặp vướng mắc gì. Cố gắng tiếp tục phát huy ở các buổi học tới!"
- "Buổi hôm nay em đi học hơi muộn so với giờ học. Trong lớp em luôn tập trung nghe giảng, thực hành bài tập khá tốt. Tuy nhiên em cần chú ý hoàn thành BTVN đầy đủ trước khi lên lớp."
- "Trong buổi học này, em luôn tập trung nghe giảng, nắm vững kiến thức. Các thao tác thực hành em thực hiện nhanh chóng. Tuy nhiên đôi lúc em còn nói chuyện riêng trong giờ, cần chú ý khắc phục."

CHỈ TRẢ VỀ NỘI DUNG NHẬN XÉT, KHÔNG CẦN TIÊU ĐỀ HAY GIẢI THÍCH."""

    # Call API based on provider
    provider = get_model_provider(model)
    
    if provider == 'antigravity':
        content, error = call_antigravity_api(prompt, model)
    else:
        content, error = call_openrouter_api(prompt, model, api_key)
    
    if error:
        return f"<p>Lỗi AI ({model}): {error}</p>"
    
    # Clean up content
    content = content.strip()
    content = content.replace('"', '').replace("'", "")
    if content.startswith("-"):
        content = content[1:].strip()
    if not content.startswith("<p>"):
        content = f"<p>{content}</p>"
    return content


# ============== ROUTES ==============

@app.route('/homework')
def homework_page():
    return render_template('homework.html')


@app.route('/')
def index():
    config = load_config()
    return render_template('index.html', 
                         openrouter_key=config.get('openrouter_key', ''),
                         ai_model=config.get('ai_model', 'gemini-3-flash'),
                         custom_model_id=config.get('custom_model_id', ''),
                         ai_models=AI_MODELS,
                         is_logged_in=lms_client.lms_token is not None)


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    # Save firebase key if provided
    if data.get('firebase_key'):
        config = load_config()
        config['firebase_key'] = data['firebase_key']
        save_config(config)
    
    success, message = lms_client.login(data['email'], data['password'], data.get('firebase_key'))
    return jsonify({"success": success, "message": message})


@app.route('/api/save_config', methods=['POST'])
def save_config_api():
    data = request.json
    config = load_config()
    if 'openrouter_key' in data:
        config['openrouter_key'] = data['openrouter_key']
    if 'ai_model' in data:
        config['ai_model'] = data['ai_model']
    if 'custom_model_id' in data:
        config['custom_model_id'] = data['custom_model_id']
    
    save_config(config)
    return jsonify({"success": True})


@app.route('/api/classes', methods=['GET'])
def get_classes():
    query = """query GetClasses($pageIndex: Int!, $itemsPerPage: Int!, $statusIn: [String]) {
        classes(payload: {
            pageIndex: $pageIndex,
            itemsPerPage: $itemsPerPage,
            status_in: $statusIn,
            orderBy: "createdAt_desc"
        }) {
            data {
                id
                name
                status
                course { id name shortName }
                classSites { _id name }
                slots { _id index date summary }
                startDate
                endDate
            }
            pagination { total }
        }
    }"""
    
    variables = {
        "pageIndex": 0,
        "itemsPerPage": 50,
        "statusIn": ["RUNNING"]
    }
    
    result = lms_client.call_api("GetClasses", query, variables)
    
    if "error" in result:
        return jsonify({"error": result["error"]}), 401
    
    if "errors" in result:
        return jsonify({"error": result["errors"][0].get("message", "Unknown error")}), 400
    
    classes = result.get("data", {}).get("classes", {}).get("data", [])
    return jsonify({"classes": classes})


@app.route('/api/class/<class_id>', methods=['GET'])
def get_class_detail(class_id):
    query = """query GetClassById($id: ID!) {
        classesById(id: $id) {
            id
            name
            courseProcessId
            classSites { _id name }
            slots {
                _id
                index
                date
                summary
                studentAttendance {
                    _id
                    student { id fullName }
                    status
                    commentByAreas { grade content commentAreaId type }
                }
            }
        }
    }"""
    
    result = lms_client.call_api("GetClassById", query, {"id": class_id})
    
    if "error" in result:
        return jsonify({"error": result["error"]}), 401
    
    class_data = result.get("data", {}).get("classesById", {})
    return jsonify({"class": class_data})


@app.route('/api/notes', methods=['GET'])
def get_notes():
    return jsonify(load_notes())


@app.route('/api/notes/<student_id>', methods=['POST'])
def save_student_note(student_id):
    data = request.json
    notes = load_notes()
    if student_id not in notes:
        notes[student_id] = []
    notes[student_id].append({
        "date": datetime.now().isoformat(),
        "note": data['note']
    })
    save_notes(notes)
    return jsonify({"success": True})


@app.route('/api/generate_comment', methods=['POST'])
def generate_comment():
    data = request.json
    config = load_config()
    api_key = config.get('openrouter_key', '')
    
    # Check provider - Antigravity doesn't need API key
    model_id = config.get('ai_model', 'gemini-3-flash')
    provider = get_model_provider(model_id)
    
    if provider != 'antigravity' and not api_key:
        return jsonify({"error": "Please set OpenRouter API key"}), 400
    
    # Get past comments for this student
    past_comments = ""
    for slot in data.get('past_slots', []):
        for area in slot.get('commentByAreas', []):
            if area.get('type') == 'CONTENT' and area.get('content'):
                past_comments += f"- Buổi {slot.get('index', '?')}: {area['content']}\n"
    
    # Get notes
    notes = load_notes()
    student_notes = notes.get(data['student_id'], [])
    notes_text = "\n".join([n['note'] for n in student_notes])
    
    # Check if student was late
    is_late = data.get('is_late', False)
    if is_late:
        notes_text = "Học sinh đi học muộn buổi này.\n" + notes_text
    
    comment = generate_comment_with_ai(
        api_key,
        data['student_name'],
        past_comments,
        notes_text,
        data.get('session_summary', ''),
        comment_length=data.get('comment_length', 'medium'),
        custom_prompt=data.get('custom_prompt', '')
    )
    
    return jsonify({"comment": comment})


@app.route('/api/submit_comment', methods=['POST'])
def submit_comment():
    data = request.json

    # Default byAreas with 7 RATE areas (grade=5) + 1 CONTENT area for AI comment
    # These are standard MindX COD comment areas
    by_areas = [
        {
            "grade": 5,
            "content": "- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng.\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè",
            "commentAreaId": "66f12601cdcebc582a30307f",
            "type": "RATE"
        },
        {
            "grade": 5,
            "content": "- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật.",
            "commentAreaId": "66f12569cdcebc582a302bd2",
            "type": "RATE"
        },
        {
            "grade": 5,
            "content": "- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán.",
            "commentAreaId": "66f125d3cdcebc582a302f35",
            "type": "RATE"
        },
        {
            "grade": 5,
            "content": "- Học viên tập trung lắng nghe bài giảng, tự giác học tập, giáo viên hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên.\n",
            "commentAreaId": "66f12637cdcebc582a30321c",
            "type": "RATE"
        },
        {
            "grade": 5,
            "content": "- Ngoài việc nắm chắc kiến thức được hướng dẫn trong buổi học,  học viên có sự chủ động đặt câu hỏi với giáo viên để mở rộng/ nâng cao thêm vốn hiểu biết.",
            "commentAreaId": "66f124bbcdcebc582a302727",
            "type": "RATE"
        },
        {
            "grade": 5,
            "content": "- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình, biết tối ưu hoá đoạn code và sắp xếp chỉnh chu, gọn gàng\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ giáo viên",
            "commentAreaId": "66f12525cdcebc582a302a65",
            "type": "RATE"
        },
        {
            "grade": 5,
            "content": "- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng",
            "commentAreaId": "66f1259bcdcebc582a302cd7",
            "type": "RATE"
        },
        {
            "content": data['comment'],  # AI generated comment goes here
            "commentAreaId": "67b54307f79c7bc326e017ff",
            "type": "CONTENT"
        }
    ]

    # Build the full content string from byAreas (for LMS display)
    content_parts = []
    area_names = [
        "Kỹ năng giao tiếp, hợp tác",
        "Kỹ năng giải quyết vấn đề",
        "Kỹ năng sử dụng máy tính",
        "Thái độ học tập trên lớp",
        "Kiến thức học viên đã được học tại lớp",
        "Tư duy máy tính, tư duy thuật toán",
        "Tư duy sáng tạo"
    ]
    for i, area in enumerate(by_areas[:7]):
        content_parts.append(f"- [COD]  {area_names[i]}: {area['content']}")
    content_parts.append(f"- Đánh giá chung: {data['comment']}")
    full_content = "<br>".join(content_parts)

    payload = {
        "slotId": data['slot_id'],
        "classSiteId": data['class_site_id'],
        "sessionNumber": data['session_number'],
        "classId": data['class_id'],
        "courseProcessId": data['course_process_id'],
        "slotType": "Default",
        "rank": "N/A",
        "totalScore": None,
        "studentComment": {
            "studentAttendanceId": data['student_attendance_id'],
            "studentId": data['student_id'],
            "content": full_content,
            "byAreas": by_areas
        }
    }

    # Add summary if provided
    if data.get('summary'):
        payload['summary'] = data['summary']

    query = """mutation UpdateSlotComment($payload: UpdateSlotCommentCommand!) {
        classes {
            updateSlotComment(payload: $payload) {
                id
                name
                slots {
                    _id
                    date
                    startTime
                    endTime
                    sessionHour
                    teachers {
                        _id
                        teacher {
                            id
                            username
                            code
                            fullName
                            email
                            phoneNumber
                            user
                            imageUrl
                        }
                        role {
                            id
                            name
                            shortName
                        }
                        isActive
                    }
                    teacherAttendance {
                        _id
                        teacher {
                            id
                            username
                            fullName
                            email
                            phoneNumber
                            user
                            imageUrl
                        }
                        status
                        note
                        createdBy
                        createdAt
                        lastModifiedBy
                        lastModifiedAt
                    }
                    studentAttendance {
                        _id
                        student {
                            id
                            fullName
                            phoneNumber
                            email
                            gender
                            imageUrl
                            customer {
                                email
                            }
                        }
                        comment
                        sendCommentStatus
                        status
                        commentByAreas {
                            grade
                            content
                            commentAreaId
                            checkpoint {
                                practiceScore
                                checkpointScore
                                checkpointQuestions {
                                    id
                                    title
                                    result
                                    score
                                }
                            }
                            courseProcessDemoId
                            courseProcessFinalEvaluationTitle
                            courseProcessFinalEvaluationId
                            demoQuestions {
                                courseProcessDemoDetailId
                                title
                                result
                                score
                                maxScore
                            }
                            type
                        }
                        createdBy
                        createdAt
                        lastModifiedBy
                        lastModifiedAt
                        commentStatus {
                            feedback
                            status
                            version
                        }
                    }
                    summary
                    homework
                    createdAt
                    createdBy
                    lastModifiedAt
                    lastModifiedBy
                    index
                }
            }
        }
    }"""

    result = lms_client.call_api("UpdateSlotComment", query, {"payload": payload})

    if "error" in result:
        return jsonify({"error": result["error"]}), 400

    if "errors" in result:
        return jsonify({"error": result["errors"][0]["message"]}), 400

    return jsonify({"success": True, "result": result})


@app.route('/api/submit_summary', methods=['POST'])
def submit_summary():
    """Submit only the session summary (without student comment)"""
    data = request.json
    
    payload = {
        "slotId": data['slot_id'],
        "classSiteId": data['class_site_id'],
        "sessionNumber": data['session_number'],
        "classId": data['class_id'],
        "courseProcessId": data['course_process_id'],
        "slotType": "Default",
        "totalScore": None,
        "rank": "",
        "summary": data['summary']
    }
    
    query = """mutation UpdateSlotComment($payload: UpdateSlotCommentCommand!) {
        classes {
            updateSlotComment(payload: $payload) {
                id
                name
            }
        }
    }"""
    
    result = lms_client.call_api("UpdateSlotComment", query, {"payload": payload})
    
    if "error" in result:
        return jsonify({"error": result["error"]}), 400
    
    if "errors" in result:
        return jsonify({"error": result["errors"][0]["message"]}), 400
    
    return jsonify({"success": True, "result": result})


# ============== HOMEWORK GRADING APIs ==============

# Queries for homework
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


@app.route('/api/homework/<class_id>')
def get_homework_submissions(class_id):
    """Lấy danh sách bài tập của lớp"""
    result = lms_client.call_api('FindStudentSubmissionByClass', FIND_SUBMISSIONS_QUERY, {
        'payload': {'classId': class_id}
    })

    if 'error' in result:
        return jsonify({'error': result['error']}), 401

    if 'errors' in result:
        return jsonify({'error': result['errors'][0].get('message', 'Unknown error')}), 400

    data = result.get('data', {}).get('findStudentSubmissionByClass', {})
    return jsonify(data)


@app.route('/api/homework/download-url')
def get_download_url():
    """Lấy presigned URL để tải file"""
    from urllib.parse import quote
    file_key = request.args.get('key', '')
    if not file_key:
        return jsonify({'error': 'Missing file key'}), 400

    url = f"https://resources.mindx.edu.vn/api/v1/get-presigned-url?key={quote(file_key, safe='')}"
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('success'):
                return jsonify({'url': data.get('url')})
        return jsonify({'error': 'Failed to get download URL'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/homework/mark', methods=['POST'])
def mark_homework():
    """Chấm điểm bài tập"""
    data = request.json
    submission_id = data.get('id')
    score = data.get('score')
    note = data.get('note', '')

    if not submission_id or score is None:
        return jsonify({'error': 'Missing id or score'}), 400

    payload = {
        'id': submission_id,
        'score': str(score)
    }
    if note:
        payload['note'] = note

    result = lms_client.call_api('MarkStudentSubmission', MARK_SUBMISSION_QUERY, {
        'payload': payload
    })

    if 'data' in result:
        return jsonify({
            'success': True,
            'result': result['data']['studentHomework']['markStudentSubmission']
        })
    else:
        error = result.get('errors', [{'message': 'Unknown error'}])[0]['message']
        return jsonify({'error': error}), 400


@app.route('/api/homework/batch-mark', methods=['POST'])
def batch_mark_homework():
    """Chấm điểm hàng loạt"""
    data = request.json
    submissions = data.get('submissions', [])  # [{id, score, note}]

    if not submissions:
        return jsonify({'error': 'No submissions to mark'}), 400

    results = []
    for sub in submissions:
        payload = {
            'id': sub['id'],
            'score': str(sub.get('score', 100))
        }
        if sub.get('note'):
            payload['note'] = sub['note']

        result = lms_client.call_api('MarkStudentSubmission', MARK_SUBMISSION_QUERY, {
            'payload': payload
        })

        if 'data' in result:
            results.append({
                'id': sub['id'],
                'success': True,
                'result': result['data']['studentHomework']['markStudentSubmission']
            })
        else:
            error = result.get('errors', [{'message': 'Unknown error'}])[0]['message']
            results.append({
                'id': sub['id'],
                'success': False,
                'error': error
            })

    success_count = sum(1 for r in results if r['success'])
    return jsonify({
        'success': True,
        'total': len(submissions),
        'success_count': success_count,
        'results': results
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
