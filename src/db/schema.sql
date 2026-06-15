CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_notes (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_notes_student ON student_notes(student_id);

CREATE TABLE IF NOT EXISTS comment_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  class_id TEXT,
  class_name TEXT,
  session_number TEXT,
  student_id TEXT,
  student_name TEXT,
  comment TEXT NOT NULL,
  slot_type TEXT,
  scores_json TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_comment_log_class ON comment_log(class_id);
CREATE INDEX IF NOT EXISTS idx_comment_log_student ON comment_log(student_id);
CREATE INDEX IF NOT EXISTS idx_comment_log_timestamp ON comment_log(timestamp);

CREATE TABLE IF NOT EXISTS grading_jobs (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  status TEXT NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS grading_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  student_uid TEXT,
  lesson_id TEXT,
  status TEXT NOT NULL,
  score REAL,
  note TEXT,
  error TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grading_items_job ON grading_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_grading_items_status ON grading_job_items(status);

CREATE TABLE IF NOT EXISTS attachment_cache (
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  file_key TEXT NOT NULL,
  r2_key TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachment_cache_submission ON attachment_cache(submission_id);
CREATE INDEX IF NOT EXISTS idx_attachment_cache_file_key ON attachment_cache(file_key);
