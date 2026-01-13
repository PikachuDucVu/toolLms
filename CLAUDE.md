# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LMS Auto Comment Tool - A Flask web application for MindX Technology School teachers to:
1. Auto-generate student comments using AI (OpenRouter or Antigravity API)
2. Submit comments to the MindX LMS system via GraphQL API
3. Grade homework assignments (batch or individual)

## Commands

```bash
# Run the web application
python app.py

# Run homework grader CLI
python homework_grader.py list              # View pending submissions
python homework_grader.py download          # Download all homework files
python homework_grader.py grade             # Interactive grading
python homework_grader.py batch <score>     # Batch grade with same score
```

## Architecture

### Core Components

- **app.py** - Flask web server with REST API endpoints
  - Routes: `/` (main UI), `/homework` (homework grading UI)
  - API endpoints: `/api/login`, `/api/classes`, `/api/generate_comment`, `/api/submit_comment`, `/api/homework/*`
  - AI integration: `call_antigravity_api()` and `call_openrouter_api()` for comment generation

- **lms_api.py** - LMSClient class handling all MindX LMS authentication and API calls
  - Firebase authentication flow: login -> get custom token -> exchange for LMS token
  - Token caching in `token_cache.json` with auto-refresh
  - GraphQL API wrapper with `call_api(operation_name, query, variables)`

- **homework_grader.py** - CLI tool for homework management (uses LMSClient)

### Authentication Flow

1. Firebase login with email/password -> get Firebase idToken
2. Call `loginWithToken` on base-api.mindx.edu.vn
3. Get custom token via `GetCustomToken` mutation
4. Exchange custom token for final LMS token
5. Use LMS token (without "Bearer " prefix) for lms-api.mindx.vn calls

### Data Files

- `config.json` - Stores OpenRouter API key and selected AI model
- `token_cache.json` - Cached LMS authentication tokens
- `student_notes.json` - Teacher notes about students

### Templates

- `templates/index.html` - Main comment generation UI
- `templates/homework.html` - Homework grading UI

## API Endpoints

The LMS uses GraphQL APIs:
- `https://base-api.mindx.edu.vn/` - Authentication and user management
- `https://lms-api.mindx.vn/` - Class, student, and comment operations

## AI Models

Two provider types:
- **Antigravity** - Uses `ANTIGRAVITY_API_URL` (no API key needed)
- **OpenRouter** - Requires API key, uses `https://openrouter.ai/api/v1/chat/completions`
