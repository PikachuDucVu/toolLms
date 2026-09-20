CREATE TABLE IF NOT EXISTS checkpoint_exam_keys (
  exam_id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  checkpoint INTEGER NOT NULL,
  mc_question_count INTEGER NOT NULL DEFAULT 0,
  essay_question_count INTEGER NOT NULL DEFAULT 0,
  answer_key_json TEXT NOT NULL,
  model_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_exam_keys_class_checkpoint
  ON checkpoint_exam_keys(class_id, checkpoint);
