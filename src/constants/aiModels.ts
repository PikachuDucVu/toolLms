export const CUSTOM_MODEL_OPTION_ID = "__custom__";

export const AI_MODELS = [
  { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 Thinking", provider: "antigravity" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "antigravity" },
  { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro High", provider: "antigravity" },
  { id: "gpt-5.4", name: "GPT-5.4", provider: "antigravity" },
  { id: CUSTOM_MODEL_OPTION_ID, name: "Tự nhập model", provider: "antigravity" },
] as const;

export const ANTIGRAVITY_API_URL = "http://ai.ducvu.io.vn:8317/v1/chat/completions";
export const DEFAULT_AI_MODEL = "claude-sonnet-4-6";
