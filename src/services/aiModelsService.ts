import {
  AI_MODELS,
  ANTIGRAVITY_MODELS_URL,
  ANTIGRAVITY_MODELS_URL_HTTPS,
  CUSTOM_MODEL_OPTION_ID,
  toAiModelInfo,
  type AiModelInfo,
} from "../constants/aiModels";
import type { Env } from "../types";

interface RemoteModel {
  id?: string;
  owned_by?: string;
  object?: string;
}

interface ModelsCachePayload {
  models: AiModelInfo[];
  fetchedAt: string;
  sourceKeyHint?: string;
}

const MODELS_CACHE_KEY = "ai_models_list_v1";
/** Soft TTL: after this, a successful key may refresh the cache. Stale cache is still served. */
const MODELS_CACHE_SOFT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
/** Keep KV entry around even if nobody refreshes. */
const MODELS_CACHE_KV_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function fallbackModels(): AiModelInfo[] {
  return AI_MODELS.map((model) => toAiModelInfo(model.id, model.provider));
}

function ensureCustomOption(models: AiModelInfo[]): AiModelInfo[] {
  const hasCustom = models.some((model) => model.id === CUSTOM_MODEL_OPTION_ID);
  if (hasCustom) return models;
  return [...models, toAiModelInfo(CUSTOM_MODEL_OPTION_ID, "antigravity")];
}

function parseModelsPayload(text: string): AiModelInfo[] | null {
  try {
    const payload = JSON.parse(text) as { data?: RemoteModel[] };
    const remote = (payload.data || [])
      .map((item) => {
        const id = String(item.id || "").trim();
        if (!id) return null;
        return toAiModelInfo(id, item.owned_by);
      })
      .filter((model): model is AiModelInfo => Boolean(model))
      .filter((model, index, arr) => arr.findIndex((item) => item.id === model.id) === index)
      .sort((a, b) => a.id.localeCompare(b.id));

    return remote.length ? ensureCustomOption(remote) : null;
  } catch {
    return null;
  }
}

async function tryFetchModels(url: string, key: string): Promise<{ models?: AiModelInfo[]; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      return { error: text.slice(0, 200) || `HTTP ${response.status}` };
    }
    const models = parseModelsPayload(text);
    if (!models) return { error: "Invalid or empty models response" };
    return { models };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function readModelsCache(env: Env): Promise<ModelsCachePayload | null> {
  try {
    const raw = await env.TOKEN_CACHE.get(MODELS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModelsCachePayload;
    if (!Array.isArray(parsed.models) || !parsed.models.length) return null;
    return {
      ...parsed,
      models: ensureCustomOption(parsed.models),
    };
  } catch {
    return null;
  }
}

async function writeModelsCache(env: Env, models: AiModelInfo[]): Promise<void> {
  const payload: ModelsCachePayload = {
    models: ensureCustomOption(models),
    fetchedAt: new Date().toISOString(),
  };
  try {
    await env.TOKEN_CACHE.put(MODELS_CACHE_KEY, JSON.stringify(payload), {
      expirationTtl: MODELS_CACHE_KV_TTL_SECONDS,
    });
  } catch {
    // Cache is best-effort; ignore write failures.
  }
}

function isCacheFresh(cache: ModelsCachePayload): boolean {
  const ts = Date.parse(cache.fetchedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < MODELS_CACHE_SOFT_TTL_MS;
}

async function fetchFromGateway(key: string): Promise<{ models?: AiModelInfo[]; error?: string }> {
  // Prefer direct :8317 (same path as chat). Fall back to HTTPS :443 if Worker cannot reach the port.
  const primary = await tryFetchModels(ANTIGRAVITY_MODELS_URL, key);
  if (primary.models) return primary;
  const secondary = await tryFetchModels(ANTIGRAVITY_MODELS_URL_HTTPS, key);
  if (secondary.models) return secondary;
  return { error: secondary.error || primary.error || "Failed to fetch models" };
}

export async function fetchRemoteAiModels(
  env: Env,
  apiKey?: string,
  options?: { forceRefresh?: boolean },
): Promise<{
  models: AiModelInfo[];
  source: "remote" | "cache" | "fallback";
  error?: string;
  cached_at?: string;
}> {
  const userKey = (apiKey || "").trim();
  const envKey = (env.ANTIGRAVITY_API_KEY || "").trim();
  const cache = await readModelsCache(env);

  // 1) Try user key if provided
  if (userKey) {
    const remote = await fetchFromGateway(userKey);
    if (remote.models) {
      await writeModelsCache(env, remote.models);
      return { models: remote.models, source: "remote", cached_at: new Date().toISOString() };
    }
    // Invalid user key: still serve cache/fallback so the UI stays usable
    if (cache?.models?.length) {
      return {
        models: cache.models,
        source: "cache",
        error: remote.error,
        cached_at: cache.fetchedAt,
      };
    }
    return {
      models: fallbackModels(),
      source: "fallback",
      error: remote.error || "Invalid API key",
    };
  }

  // 2) No user key: serve fresh cache if available
  if (cache?.models?.length && (isCacheFresh(cache) || !options?.forceRefresh)) {
    // Optionally background-refresh with env key when stale
    if (!isCacheFresh(cache) && envKey) {
      // fire-and-forget style: await is fine on Workers; keeps cache warm for next visitor
      const remote = await fetchFromGateway(envKey);
      if (remote.models) {
        await writeModelsCache(env, remote.models);
        return { models: remote.models, source: "remote", cached_at: new Date().toISOString() };
      }
    }
    return {
      models: cache.models,
      source: "cache",
      cached_at: cache.fetchedAt,
    };
  }

  // 3) No cache (or force refresh): try server env key
  if (envKey) {
    const remote = await fetchFromGateway(envKey);
    if (remote.models) {
      await writeModelsCache(env, remote.models);
      return { models: remote.models, source: "remote", cached_at: new Date().toISOString() };
    }
    if (cache?.models?.length) {
      return {
        models: cache.models,
        source: "cache",
        error: remote.error,
        cached_at: cache.fetchedAt,
      };
    }
    return {
      models: fallbackModels(),
      source: "fallback",
      error: remote.error || "Failed to fetch models",
    };
  }

  // 4) Absolute fallback
  if (cache?.models?.length) {
    return { models: cache.models, source: "cache", cached_at: cache.fetchedAt };
  }
  return {
    models: fallbackModels(),
    source: "fallback",
    error: "Missing API key (serving built-in list)",
  };
}
