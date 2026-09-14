import { LoginResponseSchema, LoginRequestSchema, LogoutResponseSchema, SessionResponseSchema, type LoginRequest } from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';
export const sessionQuery = () => ({ queryKey: ['auth', 'session'] as const, queryFn: ({ signal }: { signal: AbortSignal }) => apiRequest('/api/v2/auth/session', { schema: SessionResponseSchema, signal }) });
export function login(request: LoginRequest, signal?: AbortSignal) { return apiRequest('/api/v2/auth/login', { method: 'POST', body: LoginRequestSchema.parse(request), schema: LoginResponseSchema, signal }); }
export function logout(signal?: AbortSignal) { return apiRequest('/api/v2/auth/logout', { method: 'POST', schema: LogoutResponseSchema, signal }); }
