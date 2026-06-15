import type { Env } from "../types";

export async function putJson<T>(env: Env, key: string, value: T): Promise<void> {
  await env.TOKEN_CACHE.put(key, JSON.stringify(value));
}

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  return env.TOKEN_CACHE.get<T>(key, "json");
}
