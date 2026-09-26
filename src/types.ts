export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_CACHE: KVNamespace;
  TOKEN_CACHE: KVNamespace;
  ATTACHMENTS: R2Bucket;
  GRADING_QUEUE: Queue<GradingQueueMessage>;
  FIREBASE_API_KEY?: string;
  ANTIGRAVITY_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  LMS_EMAIL?: string;
  LMS_PASSWORD?: string;
  KIEMTRA_BASE_URL?: string;
  KIEMTRA_API_SECRET?: string;
  CLOUD_STORAGE_BASE_URL?: string;
}

export interface SessionRecord {
  id: string;
  email: string;
  displayName?: string;
  firebaseKey?: string;
  lmsToken: string;
  refreshToken?: string;
  tokenExpiry: number;
  createdAt: string;
  updatedAt: string;
}

export interface LmsGraphqlResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message?: string; [key: string]: unknown }>;
  error?: string;
  status?: number;
  [key: string]: unknown;
}

export interface AppConfig {
  openrouter_key?: string;
  ai_model?: string;
  custom_model_id?: string;
  thinking_level?: string;
  comment_length?: string;
  custom_prompt?: string;
  firebase_key?: string;
  [key: string]: unknown;
}

export interface HomeworkSubmission {
  id: string;
  type?: string;
  note?: string;
  score?: number | string | null;
  status?: string;
  classId?: string;
  lessonId?: string;
  studentUid?: string;
  content?: { attachments?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface GradingQueueMessage {
  version?: 1;
  jobId: string;
  itemId: string;
  sessionId: string;
  classId: string;
  submission: HomeworkSubmission;
  studentName: string;
  lessonName: string;
  modelId?: string;
  customModelId?: string;
  thinkingLevel?: string;
  apiKey?: string;
}
