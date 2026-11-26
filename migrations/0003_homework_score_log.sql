-- kind: 'all' / 'selected' mark scores on the LMS; 'single' only stores an AI suggestion.
ALTER TABLE grading_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'all';
CREATE INDEX IF NOT EXISTS idx_grading_jobs_owner_class_created ON grading_jobs(owner_email, class_id, created_at DESC);

CREATE TABLE IF NOT EXISTS homework_score_log (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  class_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  student_uid TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  lesson_id TEXT NOT NULL DEFAULT '',
  lesson_name TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL,
  previous_score REAL,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('manual', 'batch', 'ai_job')),
  job_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homework_score_log_owner_class_created ON homework_score_log(owner_email, class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homework_score_log_submission ON homework_score_log(submission_id);
