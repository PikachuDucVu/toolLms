"""
LMS Auto Comment Tool - Web Interface
Tự động nhận xét học sinh bằng AI dựa vào lịch sử + notes

Architecture:
- Comment page (index.html): Frontend calls MindX APIs directly (Firebase Auth + GraphQL)
- Homework page (homework.html): Backend proxies MindX API calls via LMSClient
- AI APIs: Always via backend (keeps API keys secure)
- Server also logs submitted comments to JSON files
"""

from flask import Flask, render_template, request, jsonify, Response
import requests
import json
import os
import re
import random
import time
import base64
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, quote
import boto3
from lms_api import LMSClient, QUERIES as LMS_QUERIES

# Initialize Flask app
app = Flask(__name__)

@app.after_request
def add_no_cache(response):
    if response.content_type and 'text/html' in response.content_type:
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return response

# Initialize LMS client (for homework page only)
lms_client = LMSClient()

# Config file path
CONFIG_FILE = "config.json"

def load_config():
    """Load config from file"""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
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
        except (json.JSONDecodeError, IOError):
            pass
    return {}

def save_notes(notes):
    """Save student notes to file"""
    with open(NOTES_FILE, 'w', encoding='utf-8') as f:
        json.dump(notes, f, ensure_ascii=False, indent=2)

# Comment log file
COMMENT_LOG_FILE = "comment_log.json"

def load_comment_log():
    """Load comment log from file"""
    if os.path.exists(COMMENT_LOG_FILE):
        try:
            with open(COMMENT_LOG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return []

def save_comment_log(log):
    """Save comment log to file"""
    with open(COMMENT_LOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(log, f, ensure_ascii=False, indent=2)

def append_comment_log(entry):
    """Append a single entry to the comment log (optimized for frequent writes)"""
    log = load_comment_log()
    log.append(entry)
    save_comment_log(log)

# Comment areas for LMS (standard MindX comment structure)
COMMENT_AREAS = [
    {"id": "672f0f7b0b00b07cb06e54bb", "name": "Kỹ năng COD", "type": "RATE"},
    {"id": "672f0f7b0b00b07cb06e54bc", "name": "Đánh giá chung", "type": "CONTENT"}
]

# Default rate contents for each area
RATE_CONTENTS = {
    "672f0f7b0b00b07cb06e54bb": "Tốt"  # Kỹ năng COD mặc định là Tốt
}

CUSTOM_MODEL_OPTION_ID = "__custom__"
AI_MODELS = [
    {"id": "claude-opus-4-6-thinking", "name": "Claude Opus 4.6 Thinking", "provider": "antigravity"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "provider": "antigravity"},
    {"id": "gemini-3.1-pro-high", "name": "Gemini 3.1 Pro High", "provider": "antigravity"},
    {"id": "gpt-5.4", "name": "GPT-5.4", "provider": "antigravity"},
    {"id": CUSTOM_MODEL_OPTION_ID, "name": "Tự nhập model", "provider": "antigravity"},
]

ANTIGRAVITY_API_URL = "https://ai.ducvu.io.vn/v1/chat/completions"
ANTIGRAVITY_ADMIN_API_KEY = ""  # No default - must be provided by user


def clean_ai_response(content):
    """Clean up AI-generated comment text"""
    content = content.strip()
    content = content.replace('"', '').replace("'", "")
    if content.startswith("-"):
        content = content[1:].strip()
    if not content.startswith("<p>"):
        content = f"<p>{content}</p>"
    return content

def resolve_model_id(model_id=None, custom_model_id=None, fallback='claude-sonnet-4-6'):
    model = (model_id or '').strip()
    custom_model = (custom_model_id or '').strip()
    fallback_model = (fallback or 'claude-sonnet-4-6').strip()
    if fallback_model == CUSTOM_MODEL_OPTION_ID:
        fallback_model = 'claude-sonnet-4-6'

    if model == CUSTOM_MODEL_OPTION_ID:
        return custom_model or fallback_model
    if model:
        return model
    if custom_model:
        return custom_model
    return fallback_model


def call_antigravity_api(prompt, model_id, api_key=None):
    """Call Antigravity/CLI-Proxy API"""
    key = api_key or ANTIGRAVITY_ADMIN_API_KEY
    try:
        resp = requests.post(
            ANTIGRAVITY_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}"
            },
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
    if model_id == CUSTOM_MODEL_OPTION_ID:
        return 'antigravity'
    for m in AI_MODELS:
        if m['id'] == model_id:
            return m.get('provider', 'openrouter')
    return 'antigravity'

def generate_comment_with_ai(api_key, student_name, past_comments, notes, session_summary, model_id=None, custom_model_id=None, comment_length='medium', custom_prompt='', ai_api_key=None):
    """Generate comment using AI (OpenRouter or Antigravity)"""

    config = load_config()
    model = resolve_model_id(
        model_id,
        custom_model_id if custom_model_id is not None else config.get('custom_model_id', ''),
        config.get('ai_model', 'claude-sonnet-4-6')
    )

    # Lấy tên gọi ngắn (tên cuối)
    short_name = student_name.split()[-1] if student_name else "em"

    # Độ dài nhận xét
    length_guide = {
        'short': '2-3 câu ngắn gọn',
        'medium': '3-4 câu',
        'long': '4-5 câu chi tiết'
    }.get(comment_length, '3-4 câu')

    prompt = f"""Bạn là giáo viên lập trình tại MindX Technology School. Viết nhận xét ngắn gọn cho học sinh gửi phụ huynh.

HỌC SINH: {student_name} (gọi: {short_name})
NỘI DUNG BUỔI HỌC: {session_summary or 'Thực hành lập trình'}
NHẬN XÉT BUỔI TRƯỚC: {past_comments if past_comments else 'Buổi đầu tiên'}
GHI CHÚ BUỔI NÀY: {notes if notes else 'Học bình thường, không có gì đặc biệt'}

HƯỚNG DẪN VIẾT:
1. Viết {length_guide}, mỗi câu nối tiếp tự nhiên
2. CẤU TRÚC BẮT BUỘC theo thứ tự:
   - Câu 1: Đi học đúng giờ/muộn + tuân thủ nội quy (nếu có)
   - Câu 2-3: Tập trung nghe giảng + thao tác lập trình (nhanh/chậm/có vướng mắc)
   - Câu cuối: BTVN (đầy đủ/chưa làm) + động viên hoặc nhắc nhở

3. CÁCH DIỄN ĐẠT:
   - Dùng "em" hoặc "{short_name}" để gọi học sinh
   - Dùng "con" khi nói về học sinh với phụ huynh
   - Nối câu bằng: "Trong lớp...", "Quá trình học...", "Tuy nhiên...", "Cần chú ý..."
   - Kết thúc: "Cố gắng tiếp tục phát huy!" hoặc "Cần cố gắng hơn"

4. NẾU CÓ VẤN ĐỀ (từ ghi chú):
   - Nói chuyện riêng → "đôi lúc em còn nói chuyện riêng trong giờ, cần chú ý khắc phục"
   - Chơi game → "thầy hay phải nhắc nhở em tập trung, hạn chế làm việc riêng"
   - Trầm/ít tương tác → "em hơi trầm, cần chú ý tương tác với lớp nhiều hơn"
   - Code chậm → "tốc độ code còn chậm, cần luyện tập thêm"
   - Thiếu BTVN → "em chưa hoàn thành BTVN, nhờ phụ huynh nhắc nhở con"

5. BUỔI HỌC LÀM SẢN PHẨM CUỐI KHÓA (SPCK) - Từ buổi 9-10 trở đi:
   Nếu nội dung buổi học có liên quan đến "sản phẩm cuối khóa", "SPCK", "thiết kế app", "tích hợp giao diện":
   - Thay phần "thao tác lập trình" bằng nhận xét về TIẾN ĐỘ SẢN PHẨM
   - Các mức tiến độ:
     + Tốt: "nghiêm túc thực hiện làm SPCK, đạt kết quả đúng tiến độ đề ra"
     + Khá: "hoàn thiện khá tốt phần thiết kế giao diện"
     + Chậm: "tiến độ sản phẩm còn chậm, cần đẩy nhanh tiến độ"
   - Mô tả cụ thể tiến độ (nếu có trong ghi chú):
     + "em hoàn thành tốt các khâu thiết kế app"
     + "đang áp dụng các giao diện vào phần code Python"
     + "đã lập trình được đăng ký/đăng nhập, tích hợp giao diện màn hình Home"
     + "chưa tích hợp được vào code"
     + "các tính năng app chưa hoạt động"
   - Kết thúc: "Cố gắng tiếp tục hoàn thiện thêm ở nhà" hoặc "Chú ý hoàn thiện tại nhà, tích hợp giao diện vào Python"
   - KHÔNG đề cập BTVN trong các buổi làm SPCK (thay bằng "tiếp tục hoàn thiện sản phẩm ở nhà")
{f"6. YÊU CẦU THÊM: {custom_prompt}" if custom_prompt else ""}

VÍ DỤ NHẬN XÉT THÔNG THƯỜNG:
- "Buổi hôm nay {short_name} đến lớp rất đúng giờ, tuân thủ tốt nội quy lớp học. Trong lớp em luôn tập trung nghe giảng, thao tác lập trình nhanh chóng, không gặp vướng mắc gì. Em hoàn thành BTVN đầy đủ. Cố gắng tiếp tục phát huy ở các buổi học tới!"
- "Buổi hôm nay em đi học hơi muộn so với giờ học, cần chú ý. Trong lớp em luôn tập trung nghe giảng, thực hành bài tập khá tốt. Tuy nhiên em chưa hoàn thành BTVN đầy đủ, nhờ phụ huynh nhắc nhở con."
- "Buổi học hôm nay em đến lớp đúng giờ. Quá trình học em luôn tập trung, thao tác lập trình rất tốt và có được điểm từ thầy. Tuy nhiên đôi lúc em còn nói chuyện riêng với bạn, cần chú ý khắc phục. Em hoàn thành BTVN đầy đủ."

VÍ DỤ NHẬN XÉT BUỔI LÀM SPCK:
- "Buổi hôm nay em vào lớp rất đúng giờ, thực hiện tốt nội quy lớp học. Trong lớp em rất nghiêm túc thực hiện làm SPCK, đạt kết quả đúng tiến độ, em hoàn thành tốt các khâu thiết kế app và đang áp dụng các giao diện vào phần code Python. Cố gắng tiếp tục hoàn thiện phần tích hợp ở nhà."
- "Buổi hôm nay {short_name} đến lớp đúng giờ. Con hoàn thiện khá tốt phần thiết kế giao diện, tuy nhiên chưa tích hợp được vào code, tiến độ còn chậm so với lớp. Cần chú ý đẩy nhanh tiến độ và hoàn thiện tại nhà."
- "Buổi hôm nay em đến lớp đúng giờ, tuân thủ tốt nội quy. Trong lớp em rất nghiêm túc thực hiện làm SPCK, em đã hoàn thiện được sản phẩm và đang xây dựng slide thuyết trình, tiến độ đạt với đề ra của lớp. Cố gắng tiếp tục hoàn thiện Slide tại nhà."

CHỈ TRẢ VỀ NỘI DUNG NHẬN XÉT, KHÔNG GIẢI THÍCH."""

    # Call API based on provider
    provider = get_model_provider(model)

    if provider == 'antigravity':
        content, error = call_antigravity_api(prompt, model, ai_api_key)
    else:
        content, error = call_openrouter_api(prompt, model, api_key)

    if error:
        return f"<p>Lỗi AI ({model}): {error}</p>"

    if not content:
        return f"<p>Lỗi AI ({model}): Không nhận được phản hồi</p>"

    return clean_ai_response(content)


def generate_checkpoint_comment_with_ai(api_key, student_name, teacher_description, model_id=None, custom_model_id=None, ai_api_key=None):
    """Generate checkpoint comment using AI for sessions 5 and 9"""
    config = load_config()
    model = resolve_model_id(
        model_id,
        custom_model_id if custom_model_id is not None else config.get('custom_model_id', ''),
        config.get('ai_model', 'claude-sonnet-4-6')
    )

    short_name = student_name.split()[-1] if student_name else "em"

    prompt = f"""Bạn là giáo viên lập trình tại MindX Technology School. Viết nhận xét checkpoint (kiểm tra giữa khóa) cho học sinh gửi phụ huynh.

HỌC SINH: {student_name} (gọi: {short_name})
MÔ TẢ TÓM TẮT TỪ GIÁO VIÊN: {teacher_description if teacher_description else 'Học sinh hoàn thành bài kiểm tra tốt'}

HƯỚNG DẪN VIẾT (sử dụng ngôn từ phù hợp để phụ huynh đọc):
Viết nhận xét gồm 3 phần rõ ràng, mỗi phần 1-2 câu:

1. Điểm mạnh của học viên: Khả năng, ưu điểm, tiến bộ rõ rệt mà học viên đã thể hiện (chủ động, nhanh nhẹn, tích cực, áp dụng tốt,..)

2. Điểm cần cải thiện: Các vấn đề, điểm yếu, kỹ năng cần cải thiện, có thể là kỹ năng chuyên môn hoặc các yếu tố như sự sáng tạo, khả năng tư duy logic, khả năng giao tiếp.. (Cần cải thiện thêm về ...; Tăng cường về...; Chú ý hơn khi...)

3. Lời khuyên: Gợi ý giải pháp cụ thể giúp học viên phát triển thêm kỹ năng hoặc cải thiện những vấn đề còn yếu (Khuyến khích làm thêm bài tập bổ sung; Tìm hiểu thêm về...; Rèn luyện thêm..)

CÁCH DIỄN ĐẠT:
- Dùng "em" hoặc "{short_name}" để gọi học sinh
- Dùng "con" khi nói về học sinh với phụ huynh
- Giọng văn chuyên nghiệp, tích cực, mang tính xây dựng
- Dựa vào mô tả tóm tắt của giáo viên để nhận xét cụ thể
- KHÔNG dùng markdown, KHÔNG dùng ký tự **, KHÔNG dùng bullet list
- Viết thành một đoạn văn liền mạch hoặc các câu ngắn nối tiếp nhau
- Có thể dùng các nhãn thuần văn bản: "Điểm mạnh:", "Điểm cần cải thiện:", "Lời khuyên:"

VÍ DỤ:
- "Điểm mạnh: {short_name} thể hiện rất tốt khả năng tư duy logic trong bài kiểm tra, em hoàn thành nhanh chóng và chính xác các câu hỏi lý thuyết. Điểm cần cải thiện: Em cần chú ý hơn trong phần thực hành, đặc biệt là kỹ năng debug và xử lý lỗi. Lời khuyên: Khuyến khích con rèn luyện thêm bằng cách làm các bài tập thực hành tại nhà, tìm hiểu thêm về các kỹ thuật gỡ lỗi."

CHỈ TRẢ VỀ NỘI DUNG NHẬN XÉT THUẦN VĂN BẢN, KHÔNG GIẢI THÍCH, KHÔNG MARKDOWN."""

    provider = get_model_provider(model)

    if provider == 'antigravity':
        content, error = call_antigravity_api(prompt, model, ai_api_key)
    else:
        content, error = call_openrouter_api(prompt, model, api_key)

    if error:
        return f"<p>Lỗi AI ({model}): {error}</p>"

    return clean_ai_response(content)


def random_score_above_75(max_score, step=0.25):
    """Random a score above 75% of max_score with given step increments"""
    min_score = max_score * 0.75
    # Round up to nearest step
    min_score = (int(min_score / step) + 1) * step
    if min_score > max_score:
        min_score = max_score
    # Generate possible scores
    possible = []
    current = min_score
    while current <= max_score + 0.001:  # small epsilon for float comparison
        possible.append(round(current, 2))
        current += step
    if not possible:
        possible = [max_score]
    return random.choice(possible)


# ============== ROUTES ==============

@app.route('/homework')
def homework_page():
    config = load_config()
    custom_model_id = config.get('custom_model_id', '')
    ai_model = config.get('ai_model', 'claude-sonnet-4-6')
    if custom_model_id and ai_model not in {m['id'] for m in AI_MODELS}:
        ai_model = CUSTOM_MODEL_OPTION_ID
    return render_template('homework.html',
                         ai_models=AI_MODELS,
                         ai_model=ai_model,
                         custom_model_id=custom_model_id)


@app.route('/')
def index():
    config = load_config()
    custom_model_id = config.get('custom_model_id', '')
    ai_model = config.get('ai_model', 'claude-sonnet-4-6')
    if custom_model_id and ai_model not in {m['id'] for m in AI_MODELS}:
        ai_model = CUSTOM_MODEL_OPTION_ID
    return render_template('index.html',
                         openrouter_key=config.get('openrouter_key', ''),
                         ai_model=ai_model,
                         custom_model_id=custom_model_id,
                         ai_models=AI_MODELS)


# ============== AUTH ROUTE (for comment page - server-side auth, returns token to frontend) ==============

FIREBASE_API_KEY = "AIzaSyAh2Au-mk5ci-hN83RUBqj1fsAmCMdvJx4"
WORKER_BASE_URL = "https://mindx-proxy.ducvubn1.workers.dev"

# Auth flow uses direct upstreams so requests.Session preserves MindX session cookies correctly
FIREBASE_AUTH_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
FIREBASE_CUSTOM_TOKEN_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={FIREBASE_API_KEY}"
FIREBASE_REFRESH_URL = f"https://securetoken.googleapis.com/v1/token?key={FIREBASE_API_KEY}"
BASE_API_URL_UPSTREAM = "https://base-api.mindx.edu.vn/"

BROWSER_HEADERS = {
    "Accept": "*/*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

def get_client_ip():
    """Get real client IP (behind Cloudflare + nginx)"""
    return (
        request.headers.get('CF-Connecting-IP') or
        request.headers.get('X-Real-IP') or
        request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or
        request.remote_addr
    )

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Server-side auth flow for comment page.
    Does the full 5-step Firebase+MindX auth dance and returns the final LMS token.
    The session cookie between loginWithToken and GetCustomToken is handled server-side.
    Forwards the real client IP via X-Forwarded-For so MindX sees the browser's IP.
    """
    data = request.json
    email = data.get('email', '')
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password required"}), 400

    client_ip = get_client_ip()

    try:
        session = requests.Session()

        # Step 1: Firebase login
        resp = session.post(FIREBASE_AUTH_URL, json={
            "returnSecureToken": True,
            "email": email,
            "password": password,
            "clientType": "CLIENT_TYPE_WEB"
        }, headers={
            "X-Forwarded-For": client_ip,
        }, timeout=15)
        if resp.status_code != 200:
            err = resp.json().get('error', {}).get('message', resp.text[:100])
            return jsonify({"success": False, "error": f"Firebase login failed: {err}"}), 400
        firebase_token = resp.json().get("idToken")

        # Step 2: loginWithToken (establishes session cookie)
        headers = {
            **BROWSER_HEADERS,
            "Content-Type": "application/json",
            "Origin": "https://base.mindx.edu.vn",
            "Referer": "https://base.mindx.edu.vn/",
            "X-Forwarded-For": client_ip,
            "X-Real-IP": client_ip,
        }
        session.post(BASE_API_URL_UPSTREAM, headers=headers, json={
            "operationName": "loginWithToken",
            "variables": {"idToken": firebase_token},
            "query": "mutation loginWithToken($idToken: String!) {\n  loginWithToken(idToken: $idToken)\n}\n"
        }, timeout=15)

        # Step 3: GetCustomToken (needs session cookie from step 2)
        headers["Origin"] = "https://lms.mindx.edu.vn"
        headers["Referer"] = "https://lms.mindx.edu.vn/"
        headers["Authorization"] = f"Bearer {firebase_token}"
        resp = session.post(BASE_API_URL_UPSTREAM, headers=headers, json={
            "operationName": "GetCustomToken",
            "variables": {},
            "query": "mutation GetCustomToken{users{getCustomToken{customToken}}}"
        }, timeout=15)
        result = resp.json()
        if "errors" in result:
            return jsonify({"success": False, "error": result["errors"][0].get("message", "GetCustomToken failed")}), 400
        custom_token = result.get("data", {}).get("users", {}).get("getCustomToken", {}).get("customToken")
        if not custom_token:
            return jsonify({"success": False, "error": "No custom token in response"}), 400

        # Step 4: Exchange custom token
        resp = session.post(FIREBASE_CUSTOM_TOKEN_URL, json={
            "token": custom_token,
            "returnSecureToken": True
        }, timeout=15)
        if resp.status_code != 200:
            return jsonify({"success": False, "error": "Token exchange failed"}), 400
        exchange_data = resp.json()
        lms_token = exchange_data.get("idToken")
        refresh_token = exchange_data.get("refreshToken")

        # Step 5: Refresh token
        token_expiry = 0
        if refresh_token:
            resp = session.post(FIREBASE_REFRESH_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token
            }, headers={
                **BROWSER_HEADERS,
                "Origin": "https://lms.mindx.edu.vn",
                "Referer": "https://lms.mindx.edu.vn/"
            }, timeout=15)
            if resp.status_code == 200:
                refresh_data = resp.json()
                lms_token = refresh_data.get("access_token", lms_token)
                expires_in = refresh_data.get("expires_in")
                if expires_in:
                    token_expiry = int(time.time()) + int(expires_in)

        # Fallback: parse expiry from JWT
        if not token_expiry:
            try:
                payload_part = lms_token.split('.')[1]
                payload_part += '=' * (4 - len(payload_part) % 4)
                token_data = json.loads(base64.b64decode(payload_part))
                token_expiry = token_data.get('exp', 0)
            except (ValueError, KeyError):
                pass

        return jsonify({
            "success": True,
            "lms_token": lms_token,
            "token_expiry": token_expiry
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ============== PROXY ROUTE (for MindX API calls from frontend) ==============

ALLOWED_PROXY_HOSTS = {
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'base-api.mindx.edu.vn',
    'lms-api.mindx.edu.vn',
}

@app.route('/api/proxy', methods=['POST'])
def proxy_request():
    """Transparent proxy for MindX API calls when CORS blocks direct browser requests.
    Frontend sends: { url, method, headers, body }
    Server forwards as-is and returns the response.
    """
    data = request.json
    target_url = data.get('url', '')
    method = data.get('method', 'POST').upper()
    headers = data.get('headers', {})
    body = data.get('body')

    # Security: only allow proxying to known MindX/Firebase hosts
    parsed = urlparse(target_url)
    if parsed.hostname not in ALLOWED_PROXY_HOSTS:
        return jsonify({"error": f"Proxy not allowed for host: {parsed.hostname}"}), 403

    try:
        if method == 'POST':
            if isinstance(body, dict):
                resp = requests.post(target_url, headers=headers, json=body, timeout=30)
            else:
                resp = requests.post(target_url, headers=headers, data=body, timeout=30)
        elif method == 'GET':
            resp = requests.get(target_url, headers=headers, timeout=30)
        else:
            return jsonify({"error": f"Unsupported method: {method}"}), 400

        # Forward response as-is
        try:
            return jsonify(resp.json()), resp.status_code
        except (ValueError, json.JSONDecodeError):
            return Response(resp.text, status=resp.status_code, content_type=resp.headers.get('content-type', 'text/plain'))
    except requests.exceptions.Timeout:
        return jsonify({"error": "Proxy timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============== COMMENT LOG ROUTE ==============

@app.route('/api/log_comment', methods=['POST'])
def log_comment():
    """Log a submitted comment for record-keeping.
    Called by frontend after successfully submitting to MindX API.
    """
    data = request.json
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "class_id": data.get('class_id', ''),
        "class_name": data.get('class_name', ''),
        "session_number": data.get('session_number', ''),
        "student_id": data.get('student_id', ''),
        "student_name": data.get('student_name', ''),
        "comment": data.get('comment', ''),
        "slot_type": data.get('slot_type', 'Default'),
        "scores": data.get('scores', {}),
        "success": data.get('success', True),
    }

    append_comment_log(log_entry)

    return jsonify({"success": True, "logged": True})


@app.route('/api/comment_history', methods=['GET'])
def get_comment_history():
    """Get comment history, optionally filtered by class_id or student_id"""
    log = load_comment_log()
    class_id = request.args.get('class_id')
    student_id = request.args.get('student_id')

    if class_id:
        log = [e for e in log if e.get('class_id') == class_id]
    if student_id:
        log = [e for e in log if e.get('student_id') == student_id]

    return jsonify({"history": log})


# ============== CONFIG & NOTES ROUTES (unchanged) ==============

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


# ============== AI ROUTES (unchanged - always via backend) ==============

@app.route('/api/generate_comment', methods=['POST'])
def generate_comment():
    data = request.json
    config = load_config()
    api_key = config.get('openrouter_key', '')

    model_id = data.get('model_id') or config.get('ai_model', 'claude-sonnet-4-6')
    custom_model_id = data.get('custom_model_id', config.get('custom_model_id', ''))
    resolved_model = resolve_model_id(model_id, custom_model_id, config.get('ai_model', 'claude-sonnet-4-6'))
    provider = get_model_provider(model_id if model_id else resolved_model)
    ai_api_key = data.get('ai_api_key', '')

    if provider == 'antigravity' and not ai_api_key:
        return jsonify({"error": "Vui lòng nhập API Key trong phần Cấu hình"}), 400
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
        model_id=model_id,
        custom_model_id=custom_model_id,
        comment_length=data.get('comment_length', 'medium'),
        custom_prompt=data.get('custom_prompt', ''),
        ai_api_key=data.get('ai_api_key', '')
    )

    return jsonify({"comment": comment})


@app.route('/api/generate_checkpoint_comment', methods=['POST'])
def generate_checkpoint_comment():
    """Generate AI comment specifically for checkpoint sessions"""
    data = request.json
    config = load_config()
    api_key = config.get('openrouter_key', '')

    model_id = data.get('model_id') or config.get('ai_model', 'claude-sonnet-4-6')
    custom_model_id = data.get('custom_model_id', config.get('custom_model_id', ''))
    ai_api_key = data.get('ai_api_key', '')

    if not ai_api_key:
        return jsonify({"error": "Vui lòng nhập API Key trong phần Cấu hình"}), 400

    comment = generate_checkpoint_comment_with_ai(
        api_key,
        data['student_name'],
        data.get('teacher_description', ''),
        model_id=model_id,
        custom_model_id=custom_model_id,
        ai_api_key=data.get('ai_api_key', '')
    )

    return jsonify({"comment": comment})


# ============== HOMEWORK ROUTES (unchanged - still via backend/LMSClient) ==============

# Login route - now only used by homework page
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
        "statusIn": ["RUNNING", "FINISHED"]
    }

    result = lms_client.call_api("GetClasses", query, variables)

    if "error" in result:
        return jsonify({"error": result["error"]}), result.get("status", 401)

    if "errors" in result:
        return jsonify({"error": result["errors"][0].get("message", "Unknown error")}), 400

    classes = result.get("data", {}).get("classes", {}).get("data", [])

    # Separate: RUNNING classes first, then FINISHED within last 2 months
    two_months_ago = datetime.now(timezone.utc) - timedelta(days=60)
    running = []
    recently_ended = []
    for cls in classes:
        if cls.get("status") == "RUNNING":
            running.append(cls)
        elif cls.get("status") == "FINISHED" and cls.get("endDate"):
            try:
                end = datetime.fromisoformat(cls["endDate"].replace("Z", "+00:00"))
                if end >= two_months_ago:
                    cls["recentlyEnded"] = True
                    recently_ended.append(cls)
            except (ValueError, TypeError):
                pass

    # Sort recently ended by endDate descending (most recent first)
    recently_ended.sort(key=lambda c: c.get("endDate", ""), reverse=True)

    return jsonify({"classes": running + recently_ended})


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
                    commentByAreas {
                        grade
                        content
                        commentAreaId
                        type
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
                    }
                }
            }
        }
    }"""

    result = lms_client.call_api("GetClassById", query, {"id": class_id})

    if "error" in result:
        return jsonify({"error": result["error"]}), 401

    class_data = result.get("data", {}).get("classesById", {})
    return jsonify({"class": class_data})


# Queries for homework — imported from lms_api shared queries
FIND_SUBMISSIONS_QUERY = LMS_QUERIES["FindStudentSubmissionByClass"]
MARK_SUBMISSION_QUERY = LMS_QUERIES["MarkStudentSubmission"]


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


@app.route('/api/homework/ai-grade', methods=['POST'])
def ai_grade_homework():
    """Chấm bài tập bằng AI - phân tích hình ảnh bài nộp"""

    data = request.json
    attachments = data.get('attachments', [])
    lesson_name = data.get('lesson_name', '')
    student_name = data.get('student_name', '')
    model_id = data.get('model_id', '')
    custom_model_id = data.get('custom_model_id', '')
    ai_api_key = data.get('api_key', '')

    config = load_config()
    model = resolve_model_id(model_id, custom_model_id, config.get('ai_model', 'claude-sonnet-4-6'))

    provider = get_model_provider(model_id if model_id else model)
    if provider == 'antigravity' and not ai_api_key:
        return jsonify({'success': False, 'error': 'Vui lòng nhập API Key'}), 400
    if provider != 'antigravity':
        openrouter_key = config.get('openrouter_key', '')
        if not ai_api_key and not openrouter_key:
            return jsonify({'success': False, 'error': 'Vui lòng nhập API Key hoặc cấu hình OpenRouter key'}), 400

    # Get presigned URLs for image attachments
    image_urls = []
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'}

    for att in attachments:
        ext = ''
        if '.' in att:
            ext = '.' + att.rsplit('.', 1)[-1].lower()
        if ext in image_extensions:
            url = f"https://resources.mindx.edu.vn/api/v1/get-presigned-url?key={quote(att, safe='')}"
            try:
                resp = requests.get(url, timeout=10)
                if resp.status_code == 200:
                    presigned_data = resp.json()
                    if presigned_data.get('success'):
                        image_urls.append(presigned_data.get('url'))
            except (requests.RequestException, ValueError, KeyError):
                pass

    if not image_urls and not attachments:
        return jsonify({'error': 'Không có tệp đính kèm để chấm'}), 400

    # Build prompt
    file_list = ', '.join(att.split('/')[-1] for att in attachments)
    prompt_text = f"""Bạn là giáo viên chấm bài tập lập trình cho học sinh tại MindX Technology School.

Bài học: {lesson_name}
Học sinh: {student_name}
Tệp nộp: {file_list}

Hãy đánh giá bài làm của học sinh dựa trên hình ảnh đính kèm.
Tiêu chí chấm:
- Hoàn thành yêu cầu bài tập (có làm đúng theo đề bài không)
- Chất lượng code/project (gọn gàng, logic)
- Sáng tạo (có thêm tính năng, trang trí riêng không)

Cho điểm từ 0 đến 100 và nhận xét ngắn gọn bằng tiếng Việt (2-3 câu).

Trả về kết quả CHÍNH XÁC theo định dạng JSON:
{{"score": <điểm_số>, "note": "<nhận_xét>"}}
Chỉ trả về JSON, không thêm gì khác."""

    # Build multimodal content
    if image_urls:
        content = [{"type": "text", "text": prompt_text}]
        for url in image_urls:
            content.append({"type": "image_url", "image_url": {"url": url}})
    else:
        content = prompt_text

    try:
        key = ai_api_key or ANTIGRAVITY_ADMIN_API_KEY
        if provider == 'antigravity':
            api_url = ANTIGRAVITY_API_URL
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}"
            }
            body = {
                "model": model,
                "messages": [{"role": "user", "content": content}]
            }
        else:
            api_url = "https://openrouter.ai/api/v1/chat/completions"
            or_key = ai_api_key or config.get('openrouter_key', '')
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {or_key}",
                "HTTP-Referer": "https://mindx.edu.vn",
                "X-Title": "LMS Auto Comment"
            }
            body = {
                "model": model,
                "messages": [{"role": "user", "content": content}],
                "provider": {"data_collection": "allow"}
            }

        resp = requests.post(api_url, headers=headers, json=body, timeout=120)

        if resp.status_code == 200:
            ai_response = resp.json()["choices"][0]["message"]["content"]
            # Parse JSON from response
            json_match = re.search(r'\{[^{}]*"score"\s*:\s*\d+[^{}]*\}', ai_response)
            if json_match:
                result = json.loads(json_match.group())
                return jsonify({
                    'success': True,
                    'score': min(100, max(0, int(result.get('score', 100)))),
                    'note': result.get('note', '')
                })
            else:
                return jsonify({'error': 'AI không trả về kết quả hợp lệ', 'raw': ai_response}), 400
        else:
            return jsonify({'error': f'AI lỗi: {resp.text[:200]}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
