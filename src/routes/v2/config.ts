import { Hono } from 'hono';
import { UpdateConfigRequestSchema } from '@tool-lms/contracts';
import { THINKING_LEVELS } from '../../constants/aiModels';
import type { Env } from '../../types';
import type { RequestContextVariables } from '../../middleware/requestContext';
import { fetchRemoteAiModels } from '../../services/aiModelsService';
import { getConfig, saveConfig, toPublicConfig } from '../../services/configService';
import { parseV2Json, requireV2Session, v2Success } from './helpers';

export const v2ConfigRoutes = new Hono<{ Bindings: Env; Variables: RequestContextVariables }>();
export const v2ModelsRoutes = new Hono<{ Bindings: Env; Variables: RequestContextVariables }>();

v2ConfigRoutes.get('/', async (c) => v2Success(c, toPublicConfig(await getConfig(c.env), c.env)));

v2ConfigRoutes.put('/', async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, UpdateConfigRequestSchema);
  if (body instanceof Response) return body;
  const saved = await saveConfig(c.env, {
    ai_model: body.aiModel,
    custom_model_id: body.aiModel === '__custom__' ? body.customModelId : '',
    thinking_level: body.thinkingLevel,
    ...(body.commentLength !== undefined ? { comment_length: body.commentLength } : {}),
    ...(body.customPrompt !== undefined ? { custom_prompt: body.customPrompt } : {}),
  });
  return v2Success(c, toPublicConfig(saved, c.env));
});

v2ModelsRoutes.get('/models', async (c) => {
  const apiKey = c.req.header('x-ai-api-key')?.trim() || undefined;
  const forceRefresh = new URL(c.req.url).searchParams.get('refresh') === '1';
  const result = await fetchRemoteAiModels(c.env, apiKey, { forceRefresh });
  return v2Success(c, {
    source: result.source,
    cachedAt: result.cached_at || null,
    thinkingLevels: THINKING_LEVELS,
    models: result.models.map((model) => ({
      id: model.id,
      name: model.name,
      ...(model.owned_by ? { ownedBy: model.owned_by } : {}),
      reasoning: model.reasoning,
      thinkingLevels: model.thinking_levels,
    })),
  });
});
