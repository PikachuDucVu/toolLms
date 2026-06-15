# Migration Plan: Flask to Cloudflare Worker TypeScript

## Overview
This plan outlines the steps and considerations for porting the Python Flask backend of the "LMS Auto Comment Tool" to a Cloudflare Worker using TypeScript.

## Critical Files Identified
- `app.py`: Main Flask application handling routes, AI logic, and proxying.
- `lms_api.py`: Helper class for MindX LMS GraphQL API interactions and authentication.
- `config.json`: Stores user configurations (API keys, preferred models).
- `student_notes.json`: Stores teacher notes about students.
- `comment_log.json`: Logs generated and submitted comments.
- `cf-worker/worker.js`: Existing basic Cloudflare Worker proxy script (useful reference, but will be replaced/extended).

## Core Functionality to Port (Routes/Functions)

### 1. Authentication (`/api/auth/login`, `/api/login`)
- Needs to replicate the complex 5-step Firebase + MindX auth flow.
- Cloudflare Workers don't use `requests.Session`. Cookie management (saving from `loginWithToken` and passing to `GetCustomToken`) must be handled manually by parsing `Set-Cookie` headers and sending `Cookie` headers.
- IP forwarding logic (`X-Forwarded-For`) should be adapted using `request.headers.get('CF-Connecting-IP')`.

### 2. LMS API Client & Proxying (`/api/proxy`, `lms_api.py`)
- The `LMSClient` logic (token caching, auto-refreshing on 403, making GraphQL calls) needs to be ported.
- The `/api/proxy` route needs to validate allowed hosts and forward requests cleanly. The existing `cf-worker/worker.js` provides a good foundation for this proxying logic.

### 3. AI Comment Generation (`/api/generate_comment`, `/api/generate_checkpoint_comment`, `/api/homework/ai-grade`)
- Port `call_antigravity_api` and `call_openrouter_api` to use `fetch`.
- Implement `generate_comment_with_ai` and `generate_checkpoint_comment_with_ai` prompt generation logic.
- Implement `ai_grade_homework` prompt generation and JSON extraction logic.
- Handle multimodal requests (images) for homework grading by fetching presigned URLs.

### 4. Homework Routes (`/api/classes`, `/api/class/<id>`, `/api/homework/*`)
- Port GraphQL query definitions (`LMS_QUERIES`) from Python strings to JS templates.
- Implement specific endpoints that wrap LMS API calls (`get_classes`, `get_class_detail`, `get_homework_submissions`, `mark_homework`, `batch_mark_homework`).
- Adapt date parsing and filtering logic (e.g., separating RUNNING and FINISHED classes).

### 5. Data Storage (Config, Notes, Logs)
- **CRITICAL MIGRATION ISSUE**: Cloudflare Workers are serverless and stateless. They cannot read/write local files like `config.json`, `student_notes.json`, or `comment_log.json`.
- **Solution**: These MUST be migrated to Cloudflare KV, D1 (SQLite), or R2 (Object Storage). KV is likely the best fit for simple JSON blobs (Notes, Config), while D1 might be better if logs need complex querying.

## Helper Functions to Port
- `clean_ai_response`: Text cleanup logic.
- `resolve_model_id`: Logic to determine which model to use.
- `get_model_provider`: Mapping models to API providers.
- `get_client_ip`: Extracting IP from request headers.

## Migration Implications & Challenges
1.  **State Management:** Replacing local JSON file I/O with Cloudflare KV/D1 is the biggest architectural change.
2.  **Session/Cookie Handling:** The Python `requests.Session` automatically handled cookies during the MindX auth flow. In TypeScript `fetch`, this must be done explicitly.
3.  **Token Caching:** `lms_api.py` caches tokens in memory and on disk. In a Worker, memory caching is per-isolate and ephemeral. Token caching should also move to KV for persistence across worker instances.
4.  **Environment Variables:** Sensitive keys (Firebase API key, Antigravity API key) currently hardcoded or in config files should be moved to Cloudflare Worker Secrets.
5.  **Timeout Limits:** Free Cloudflare Workers have CPU time limits (10ms-50ms) and wall-clock limits. Long-running AI API calls (up to 120s timeout in Python) might hit Cloudflare's limits, especially on free plans, requiring careful architecture (perhaps returning early and processing in background, or ensuring the worker is on a paid plan if limits are exceeded, though `fetch` waiting for I/O usually doesn't count against CPU time, it does count against overall request time).
