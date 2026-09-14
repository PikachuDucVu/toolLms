ALTER TABLE grading_jobs ADD COLUMN owner_email TEXT;
CREATE INDEX IF NOT EXISTS idx_grading_jobs_owner_created ON grading_jobs(owner_email, created_at DESC);
