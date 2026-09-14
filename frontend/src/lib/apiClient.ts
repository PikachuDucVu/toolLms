import { ApiErrorEnvelopeSchema, type ApiErrorEnvelope } from '@tool-lms/contracts';
import type { z } from 'zod';
import { ApiError } from './apiError';

export interface ApiRequestOptions<TSchema extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  schema: TSchema;
}

type AuthRequiredListener = (error: ApiError) => void;
const authRequiredListeners = new Set<AuthRequiredListener>();

export function onAuthRequired(listener: AuthRequiredListener): () => void {
  authRequiredListeners.add(listener);
  return () => authRequiredListeners.delete(listener);
}

export async function apiRequest<TSchema extends z.ZodType>(
  path: string,
  options: ApiRequestOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers,
    body: options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body),
    signal: options.signal,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const requestId = response.headers.get('x-request-id') || 'unknown';
    throw new ApiError('Phản hồi máy chủ không hợp lệ.', 'UPSTREAM_ERROR', requestId, response.status);
  }

  if (!response.ok) {
    const parsed = ApiErrorEnvelopeSchema.safeParse(payload);
    const envelope: ApiErrorEnvelope = parsed.success ? parsed.data : {
      success: false,
      error: {
        code: response.status === 401 ? 'AUTH_REQUIRED' : 'UPSTREAM_ERROR',
        message: 'Yêu cầu không thành công.',
        requestId: response.headers.get('x-request-id') || 'unknown',
      },
    };
    const error = new ApiError(envelope.error.message, envelope.error.code, envelope.error.requestId, response.status, envelope.error.details);
    if (error.code === 'AUTH_REQUIRED') authRequiredListeners.forEach((listener) => listener(error));
    throw error;
  }

  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('Phản hồi máy chủ không đúng định dạng.', 'UPSTREAM_ERROR', response.headers.get('x-request-id') || 'unknown', response.status);
  }
  return parsed.data;
}
