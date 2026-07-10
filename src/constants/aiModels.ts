export const CUSTOM_MODEL_OPTION_ID = "__custom__";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "high";

// Hit the gateway app directly on port 8317. Port 443 goes through nginx, which 301-redirects
// /v1/* back onto itself (infinite loop) — the Worker's fetch follows redirects and dies with
// "Too many redirects". The host's geo-filter (nftables, VN/SG only) must allow Cloudflare's
// egress ranges or this host silently drops the Worker's packets (manifests as "error code: 522").
export const ANTIGRAVITY_BASE_URL = "http://ai.ducvu.io.vn:8317/v1";
export const ANTIGRAVITY_API_URL = `${ANTIGRAVITY_BASE_URL}/chat/completions`;
export const ANTIGRAVITY_MODELS_URL = `${ANTIGRAVITY_BASE_URL}/models`;
/** Public HTTPS fallback for listing models (443). Chat still prefers :8317 from the Worker. */
export const ANTIGRAVITY_MODELS_URL_HTTPS = "https://ai.ducvu.io.vn/v1/models";

/** Fallback list when /v1/models is unreachable */
export const AI_MODELS = [
  { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 Thinking", provider: "antigravity" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "antigravity" },
  { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro High", provider: "antigravity" },
  { id: "gpt-5.4", name: "GPT-5.4", provider: "antigravity" },
  { id: "grok-4.5", name: "Grok 4.5", provider: "antigravity" },
  { id: CUSTOM_MODEL_OPTION_ID, name: "Tự nhập tên model", provider: "antigravity" },
] as const;

export const DEFAULT_AI_MODEL = "gpt-5.4";

export interface AiModelInfo {
  id: string;
  name: string;
  provider: string;
  owned_by?: string;
  reasoning: boolean;
  thinking_levels: ThinkingLevel[];
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

/**
 * Map model id → supported thinking levels (PI-style).
 * - non-reasoning: only off
 * - grok-4.5 / most reasoning: low/medium/high (no off, no minimal; xhigh maps via clamp)
 * - multi-agent: low/medium/high/xhigh
 * - generic reasoning (claude/gemini/gpt-5/thinking): full set including off
 */
export function getThinkingLevelsForModel(id: string, ownedBy?: string): ThinkingLevel[] {
  const lowerId = (id || "").toLowerCase();
  const provider = (ownedBy || "").toLowerCase();
  const isGrok = lowerId.includes("grok") || provider === "xai";
  const isGrokNonReasoning =
    lowerId.includes("non-reasoning") ||
    lowerId.includes("imagine") ||
    lowerId.includes("image") ||
    lowerId.includes("video");
  const isGrokMultiAgent = lowerId.includes("multi-agent");
  const isReasoning =
    (isGrok && !isGrokNonReasoning) ||
    lowerId.includes("claude") ||
    lowerId.includes("gemini") ||
    lowerId.includes("gpt-5") ||
    lowerId.includes("o1") ||
    lowerId.includes("o3") ||
    lowerId.includes("thinking") ||
    (lowerId.includes("reasoning") && !lowerId.includes("non-reasoning"));

  if (!isReasoning) return ["off"];

  if (isGrok) {
    if (isGrokMultiAgent) return ["low", "medium", "high", "xhigh"];
    // Grok 4.5: reasoning cannot be disabled; low/medium/high only
    return ["low", "medium", "high"];
  }

  // Claude / Gemini / GPT-5 family: allow full PI ladder
  return ["off", "minimal", "low", "medium", "high", "xhigh"];
}

export function modelSupportsReasoning(id: string, ownedBy?: string): boolean {
  const levels = getThinkingLevelsForModel(id, ownedBy);
  return levels.some((level) => level !== "off");
}

export function clampThinkingLevel(id: string, level: string | undefined, ownedBy?: string): ThinkingLevel {
  const levels = getThinkingLevelsForModel(id, ownedBy);
  if (level && levels.includes(level as ThinkingLevel)) return level as ThinkingLevel;

  // Prefer high, then medium, then last available, then off
  for (const preferred of ["high", "medium", "low", "minimal", "xhigh", "off"] as ThinkingLevel[]) {
    if (levels.includes(preferred)) return preferred;
  }
  return levels[0] || "off";
}

export function toAiModelInfo(id: string, ownedBy?: string): AiModelInfo {
  const thinking_levels = getThinkingLevelsForModel(id, ownedBy);
  const name =
    id === CUSTOM_MODEL_OPTION_ID
      ? "Tự nhập tên model"
      : ownedBy
        ? `${id} (${ownedBy})`
        : id;
  return {
    id,
    name,
    provider: "antigravity",
    owned_by: ownedBy,
    reasoning: thinking_levels.some((level) => level !== "off"),
    thinking_levels,
  };
}
