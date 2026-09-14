import { DEFAULT_AI_MODEL, DEFAULT_THINKING_LEVEL, THINKING_LEVELS, isThinkingLevel } from "../constants/aiModels";
import type { AppConfig, Env } from "../types";

const COMMENT_LENGTHS = ["short", "medium", "long"] as const;
const CONFIG_KEYS = ["openrouter_key", "ai_model", "custom_model_id", "thinking_level", "comment_length", "custom_prompt", "firebase_key"] as const;

export interface PublicConfig {
  aiModel: string;
  customModelId: string;
  thinkingLevel: (typeof THINKING_LEVELS)[number];
  thinkingLevels: typeof THINKING_LEVELS;
  commentLength: (typeof COMMENT_LENGTHS)[number];
  customPrompt: string;
  hasOpenRouterKey: boolean;
}

export function toPublicConfig(config: AppConfig, env: Env): PublicConfig {
  return {
    aiModel: String(config.ai_model || DEFAULT_AI_MODEL),
    customModelId: String(config.custom_model_id || ''),
    thinkingLevel: isThinkingLevel(config.thinking_level) ? config.thinking_level : DEFAULT_THINKING_LEVEL,
    thinkingLevels: THINKING_LEVELS,
    commentLength: normalizeCommentLength(config.comment_length),
    customPrompt: String(config.custom_prompt || '').slice(0, 2_000),
    hasOpenRouterKey: Boolean(config.openrouter_key || env.OPENROUTER_API_KEY),
  };
}

export async function getConfig(env: Env): Promise<AppConfig> {
  const result = await env.DB.prepare("SELECT key, value_json FROM app_config").all<{ key: string; value_json: string }>();
  const config: AppConfig = {};
  for (const row of result.results ?? []) {
    try {
      config[row.key] = JSON.parse(row.value_json);
    } catch {
      config[row.key] = row.value_json;
    }
  }
  return config;
}

export async function saveConfig(env: Env, patch: AppConfig): Promise<AppConfig> {
  const current = await getConfig(env);
  const next: AppConfig = { ...current };
  for (const key of CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      next[key] = patch[key];
      await env.DB.prepare(
        "INSERT INTO app_config (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      )
        .bind(key, JSON.stringify(patch[key] ?? ""), new Date().toISOString())
        .run();
    }
  }
  return next;
}

function normalizeCommentLength(value: unknown): (typeof COMMENT_LENGTHS)[number] {
  return value === "short" || value === "long" ? value : "medium";
}
