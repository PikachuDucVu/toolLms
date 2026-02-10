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

### Core Files

- **app.py** - Flask web server. Routes: `/` (comment UI), `/homework` (grading UI). API endpoints under `/api/*`. Contains the AI prompt template for generating Vietnamese student comments and the `COMMENT_AREAS` / `by_areas` structure for LMS submission.
- **lms_api.py** - `LMSClient` class handling MindX LMS authentication and GraphQL API calls. Has hardcoded default credentials as fallback (overridden by web UI login). Contains pre-defined GraphQL queries in `QUERIES` dict.
- **homework_grader.py** - CLI tool for homework management, uses `LMSClient` from `lms_api.py`.
- **templates/index.html**, **templates/homework.html** - Single-file HTML templates with embedded JS/CSS (no build step, no separate static assets).

### Authentication Flow

1. Firebase login with email/password → get Firebase `idToken`
2. Call `loginWithToken` mutation on `base-api.mindx.edu.vn` (establishes session cookies)
3. Get custom token via `GetCustomToken` mutation (requires `Authorization: Bearer <firebase_token>`)
4. Exchange custom token for final LMS token via Firebase `signInWithCustomToken`
5. Use LMS token **without** `"Bearer "` prefix for `lms-api.mindx.vn` calls
6. Tokens are cached in `token_cache.json` with auto-refresh on 403 or `INVALID_TOKEN`

### Comment Submission Structure

Comments are submitted via `UpdateSlotComment` mutation with a `byAreas` array containing:
- 7 fixed RATE areas (hardcoded COD skill descriptions with grade=5, using MindX comment area IDs)
- 1 CONTENT area for the AI-generated comment text

The comment area IDs (e.g., `66f12601cdcebc582a30307f`) are MindX-specific and hardcoded in `app.py`.

### AI Integration

Two provider types determined by `get_model_provider()`:
- **Antigravity** - Uses `ANTIGRAVITY_API_URL` constant (no API key needed), 120s timeout
- **OpenRouter** - Requires API key stored in `config.json`, 60s timeout

Both use OpenAI-compatible `/v1/chat/completions` format.

### Data Files (gitignored)

- `config.json` - OpenRouter API key and selected AI model
- `token_cache.json` - Cached LMS authentication tokens
- `student_notes.json` - Teacher notes about students (keyed by student ID)

### Debug Scripts

Files like `debug_*.py`, `analyze_login.py`, `find_auth.py`, `check_lms_auth.py`, `call_api.py` are development artifacts from reverse-engineering the LMS API. They are not part of the application.
