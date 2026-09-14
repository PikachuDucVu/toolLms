import { ApiError } from './apiError';

export type SafeClientErrorType = 'ApiError' | 'TypeError' | 'RangeError' | 'Error' | 'UnknownError';
export type SafeClientErrorCategory = 'react-boundary' | 'react-root-uncaught';
export type SafeClientErrorEvent = {
  category: SafeClientErrorCategory;
  incidentId: string;
  errorType: SafeClientErrorType;
  requestId?: string;
};

export function createClientIncidentId(): string {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (id) return `client-${id}`;
  } catch {
    // Fall back to non-sensitive client entropy when randomUUID is unavailable.
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function safeClientRequestId(error: unknown): string {
  return error instanceof ApiError ? safeIdentifier(error.requestId) : '';
}

export function safeClientErrorEvent(category: SafeClientErrorCategory, error: unknown, incidentId = createClientIncidentId()): SafeClientErrorEvent {
  const requestId = safeClientRequestId(error);
  return {
    category,
    incidentId: safeIdentifier(incidentId) || createClientIncidentId(),
    errorType: safeErrorType(error),
    ...(requestId ? { requestId } : {}),
  };
}

function safeIdentifier(value: string | null | undefined): string {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : '';
}

function safeErrorType(error: unknown): SafeClientErrorType {
  if (error instanceof ApiError) return 'ApiError';
  if (error instanceof TypeError) return 'TypeError';
  if (error instanceof RangeError) return 'RangeError';
  if (error instanceof Error) return 'Error';
  return 'UnknownError';
}
