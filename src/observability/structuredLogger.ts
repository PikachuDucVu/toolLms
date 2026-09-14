import type { Context } from "hono";
import { matchedRoutes } from "hono/route";

const ALLOWED_FIELDS = new Set([
  "requestId",
  "route",
  "method",
  "status",
  "duration",
  "category",
  "jobId",
  "itemId",
  "fromStatus",
  "toStatus",
] as const);

type AllowedField =
  | "requestId"
  | "route"
  | "method"
  | "status"
  | "duration"
  | "category"
  | "jobId"
  | "itemId"
  | "fromStatus"
  | "toStatus";

export type StructuredLogFields = Partial<Record<AllowedField, string | number>>;

export function allowlistedLogFields(fields: Record<string, unknown>): StructuredLogFields {
  const safe: StructuredLogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key as AllowedField)) continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    safe[key as AllowedField] = typeof value === "string" && (value.length > 500 || containsSensitiveValue(value)) ? "[REDACTED]" : value;
  }
  return safe;
}

function containsSensitiveValue(value: string): boolean {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* keep the original value */ }
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(decoded)
    || /\b(?:sk-or-v1|sk-ant)-[A-Za-z0-9_-]{8,}\b/.test(decoded)
    || /\bAIza[0-9A-Za-z_-]{20,}\b/.test(decoded)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(decoded)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(decoded);
}

export function matchedRouteTemplate(c: Context): string {
  const templates = matchedRoutes(c)
    .map((route) => route.path)
    .filter((path) => path !== "*" && path !== "/*" && !path.endsWith("/*"));
  return templates.at(-1) || "*";
}

export function structuredLog(level: "info" | "error", fields: Record<string, unknown>): void {
  const payload = JSON.stringify(allowlistedLogFields(fields));
  if (level === "error") console.error(payload);
  else console.log(payload);
}
