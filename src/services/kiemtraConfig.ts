export const DEFAULT_KIEMTRA_BASE_URL = "https://kiemtra.ducvu.io.vn";

export function kiemtraBaseUrl(env?: { KIEMTRA_BASE_URL?: string }): string {
  const configured = env?.KIEMTRA_BASE_URL?.trim();
  return (configured || DEFAULT_KIEMTRA_BASE_URL).replace(/\/$/, "");
}

export function kiemtraAuthHeaders(env?: { KIEMTRA_API_SECRET?: string }): HeadersInit {
  const secret = env?.KIEMTRA_API_SECRET?.trim();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}
