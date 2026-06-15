# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LMS Auto Comment Tool - A Flask web application for MindX Technology School teachers to:
1. Auto-generate student comments in Vietnamese using AI (OpenRouter or Antigravity API)
2. Submit comments to the MindX LMS system via GraphQL API
3. Grade homework assignments (batch or individual) via web UI and CLI

## Commands

```bash
# Run the web application (serves on port 5000)
python app.py

# Run homework grader CLI
python homework_grader.py list              # View pending submissions
python homework_grader.py download          # Download all homework files
python homework_grader.py grade             # Interactive grading
python homework_grader.py batch <score>     # Batch grade with same score
```

No requirements.txt exists. Dependencies: `flask`, `requests`, `boto3`.

## Architecture

### Dual Architecture: Frontend-Direct + Backend-Proxy

The application uses a **split architecture**:

- **Comment page (index.html)**: All MindX API calls (authentication, class loading, comment submission) are made **directly from the browser** to MindX/Firebase APIs. Tokens are stored in `localStorage`. If CORS blocks direct calls, the frontend automatically falls back to a transparent server proxy (`/api/proxy`).

- **Homework page (homework.html)**: MindX API calls go **through the Flask backend** via `LMSClient` in `lms_api.py`.

- **AI APIs**: Always routed through the Flask backend (keeps API keys secure).

- **Logging**: After successfully submitting comments to MindX, the frontend logs the submission to the server (`/api/log_comment`) for record-keeping.

### Core Files

- **app.py** - Flask web server. Routes:
  - `/` - Comment UI (serves index.html)
  - `/homework` - Grading UI (serves homework.html)
  - `/api/proxy` - Transparent proxy for MindX/Firebase API calls (CORS fallback)
  - `/api/generate_comment`, `/api/generate_checkpoint_comment` - AI comment generation
  - `/api/log_comment`, `/api/comment_history` - Comment logging to JSON
  - `/api/save_config`, `/api/notes` - Config and student notes
  - `/api/login`, `/api/classes`, `/api/class/<id>` - Used by homework page only (via LMSClient)
  - `/api/homework/*` - Homework grading endpoints (via LMSClient)

- **lms_api.py** - `LMSClient` class handling MindX LMS authentication and GraphQL API calls. Used by homework page and CLI only. Has hardcoded default credentials as fallback.

- **homework_grader.py** - CLI tool for homework management, uses `LMSClient` from `lms_api.py`.

- **templates/index.html** - Comment page. Single-file HTML with embedded JS/CSS. Contains:
  - Firebase Auth flow (REST API calls directly from browser)
  - MindX GraphQL client (direct API calls with CORS proxy fallback)
  - Comment payload builders (Default, Checkpoint, Final/Demo) - all logic in JS
  - AI comment generation (calls backend `/api/generate_comment`)
  - Comment logging (calls backend `/api/log_comment` after successful submit)

- **templates/homework.html** - Homework grading page. Single-file HTML, calls backend APIs.

### Authentication Flow (Comment Page - Frontend-Direct)

1. Firebase login with email/password → get Firebase `idToken` (browser → Firebase REST API)
2. Call `loginWithToken` mutation on `base-api.mindx.edu.vn` (browser → MindX)
3. Get custom token via `GetCustomToken` mutation (browser → MindX)
4. Exchange custom token for final LMS token via Firebase `signInWithCustomToken` (browser → Firebase)
5. Refresh token via `securetoken.googleapis.com` (browser → Google)
6. Store `lmsToken`, `tokenExpiry`, `firebaseToken` in `localStorage`
7. Use LMS token **without** `"Bearer "` prefix for `lms-api.mindx.vn` calls
8. Auto-refresh on token expiry or 403/INVALID_TOKEN responses
9. If any direct call fails due to CORS, automatically switch to `/api/proxy` mode

### Comment Submission Structure

Comments are submitted via `UpdateSlotComment` mutation with a `byAreas` array containing:
- 7 fixed RATE areas (hardcoded COD skill descriptions with grade=5, using MindX comment area IDs)
- 1 CONTENT area for the AI-generated comment text

The comment area IDs and payload builders are defined in `templates/index.html` JavaScript.

### AI Integration

Two provider types determined by `get_model_provider()`:
- **Antigravity** - Uses `ANTIGRAVITY_API_URL` constant, 120s timeout
- **OpenRouter** - Requires API key stored in `config.json`, 60s timeout

Both use OpenAI-compatible `/v1/chat/completions` format. Always routed through Flask backend.

### Data Files (gitignored)

- `config.json` - OpenRouter API key and selected AI model
- `token_cache.json` - Cached LMS authentication tokens (used by homework page/CLI only)
- `student_notes.json` - Teacher notes about students (keyed by student ID)
- `comment_log.json` - Log of all submitted comments (timestamp, class, student, comment, scores)

### Debug Scripts

Files like `debug_*.py`, `analyze_login.py`, `find_auth.py`, `check_lms_auth.py`, `call_api.py` are development artifacts from reverse-engineering the LMS API. They are not part of the application.
