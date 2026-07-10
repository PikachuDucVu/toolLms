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
}

export interface SessionRecord {
  id: string;
  email: string;
  firebaseToken?: string;
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
  firebase_key?: string;
  [key: string]: unknown;
}

export interface HomeworkSubmission {
  id: string;
  type?: string;
  note?: string;
  score?: number | string;
  status?: string;
  classId?: string;
  lessonId?: string;
  studentUid?: string;
  content?: { attachments?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface GradingQueueMessage {
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
