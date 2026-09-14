import { SessionResponseSchema } from '@tool-lms/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, onAuthRequired } from './apiClient';
import { ApiError } from './apiError';
afterEach(() => vi.unstubAllGlobals());
describe('typed API client', () => {
  it('uses same-origin credentials and parses the shared contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success:true,data:{authenticated:true,email:'teacher@example.com',tokenExpiry:1},requestId:'r1' }), { status:200, headers:{'content-type':'application/json'} })); vi.stubGlobal('fetch', fetchMock);
    const result = await apiRequest('/api/v2/auth/session', { schema: SessionResponseSchema });
    expect(result.data.email).toBe('teacher@example.com'); expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials:'same-origin' });
  });
  it('preserves error code/request ID and signals session expiry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success:false,error:{code:'AUTH_REQUIRED',message:'Expired',requestId:'r2'} }), { status:401, headers:{'content-type':'application/json'} })));
    const listener = vi.fn(); const unsubscribe = onAuthRequired(listener);
    await expect(apiRequest('/api/v2/auth/session', { schema: SessionResponseSchema })).rejects.toMatchObject({ code:'AUTH_REQUIRED', requestId:'r2' } satisfies Partial<ApiError>);
    expect(listener).toHaveBeenCalledOnce(); unsubscribe();
  });
});
