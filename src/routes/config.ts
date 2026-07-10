import { Hono } from "hono";
import { DEFAULT_AI_MODEL, DEFAULT_THINKING_LEVEL, THINKING_LEVELS } from "../constants/aiModels";
import type { Env } from "../types";
import { fetchRemoteAiModels } from "../services/aiModelsService";
import { getConfig, saveConfig } from "../services/configService";
import { readJsonBody } from "./helpers";

export const configRoutes = new Hono<{ Bindings: Env }>();

configRoutes.get("/config", async (c) => {
  const config = await getConfig(c.env);
  return c.json({
    ai_model: config.ai_model || DEFAULT_AI_MODEL,
    custom_model_id: config.custom_model_id || "",
    thinking_level: config.thinking_level || DEFAULT_THINKING_LEVEL,
    thinking_levels: THINKING_LEVELS,
    has_openrouter_key: Boolean(config.openrouter_key || c.env.OPENROUTER_API_KEY),
  });
});

configRoutes.get("/ai/models", async (c) => {
  const url = new URL(c.req.url);
  const headerKey = c.req.header("x-ai-api-key") || c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const queryKey = url.searchParams.get("api_key") || "";
  const forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("force") === "1";
  const result = await fetchRemoteAiModels(c.env, headerKey || queryKey || undefined, { forceRefresh });
  return c.json({
    success: true,
    source: result.source,
    error: result.error || null,
    cached_at: result.cached_at || null,
    models: result.models,
    thinking_levels: THINKING_LEVELS,
  });
});

configRoutes.post("/save_config", async (c) => {
  const body = await readJsonBody(c);
  await saveConfig(c.env, body);
  return c.json({ success: true });
});
