import { AiModelsResponseSchema, ConfigResponseSchema, UpdateConfigRequestSchema, UpdateConfigResponseSchema, type UpdateConfigRequest } from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';
export const configQuery = () => ({ queryKey: ['configuration'] as const, queryFn: ({ signal }: { signal: AbortSignal }) => apiRequest('/api/v2/config', { schema: ConfigResponseSchema, signal }) });
export const modelsQuery = (apiKey: string) => ({ queryKey: ['configuration', 'models', apiKey ? 'provided' : 'default'] as const, queryFn: ({ signal }: { signal: AbortSignal }) => apiRequest('/api/v2/ai/models', { schema: AiModelsResponseSchema, headers: apiKey ? { 'x-ai-api-key': apiKey } : undefined, signal }) });
export function updateConfig(request: UpdateConfigRequest, signal?: AbortSignal) { return apiRequest('/api/v2/config', { method: 'PUT', body: UpdateConfigRequestSchema.parse(request), schema: UpdateConfigResponseSchema, signal }); }
