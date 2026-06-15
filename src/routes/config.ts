import { Hono } from "hono";
import { AI_MODELS, DEFAULT_AI_MODEL } from "../constants/aiModels";
import type { Env } from "../types";
import { getConfig, saveConfig } from "../services/configService";
import { readJsonBody } from "./helpers";

export const configRoutes = new Hono<{ Bindings: Env }>();

configRoutes.get("/config", async (c) => {
  const config = await getConfig(c.env);
  return c.json({
    ai_models: AI_MODELS,
    ai_model: config.ai_model || DEFAULT_AI_MODEL,
    custom_model_id: config.custom_model_id || "",
    has_openrouter_key: Boolean(config.openrouter_key || c.env.OPENROUTER_API_KEY),
  });
});

configRoutes.post("/save_config", async (c) => {
  const body = await readJsonBody(c);
  await saveConfig(c.env, body);
  return c.json({ success: true });
});
