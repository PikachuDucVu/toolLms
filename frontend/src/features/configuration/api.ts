import { AiModelsResponseSchema, ConfigResponseSchema, UpdateConfigRequestSchema, UpdateConfigResponseSchema, type UpdateConfigRequest } from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';
export const configQuery = () => ({ queryKey: ['configuration'] as const, queryFn: ({ signal }: { signal: AbortSignal }) => apiRequest('/api/v2/config', { schema: ConfigResponseSchema, signal }) });
export const modelsQuery = (apiKey: string, refreshToken = 0) => {
  const key = apiKey.trim();
  return {
    queryKey: ['configuration', 'models', modelsCacheScope(key), refreshToken] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => apiRequest(`/api/v2/ai/models${refreshToken > 0 ? '?refresh=1' : ''}`, {
      schema: AiModelsResponseSchema,
      headers: key ? { 'x-ai-api-key': key } : undefined,
      signal,
    }),
  };
};

function modelsCacheScope(apiKey: string): string {
  if (!apiKey) return 'default';
  let hash = 2166136261;
  for (let index = 0; index < apiKey.length; index += 1) {
    hash ^= apiKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `key-${(hash >>> 0).toString(16)}`;
}
export function updateConfig(request: UpdateConfigRequest, signal?: AbortSignal) { return apiRequest('/api/v2/config', { method: 'PUT', body: UpdateConfigRequestSchema.parse(request), schema: UpdateConfigResponseSchema, signal }); }
