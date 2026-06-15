import type { AppConfig, Env } from "../types";

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
  for (const key of ["openrouter_key", "ai_model", "custom_model_id", "firebase_key"] as const) {
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
