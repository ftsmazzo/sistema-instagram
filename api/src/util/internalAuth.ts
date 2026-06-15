import { timingSafeEqual } from "node:crypto";

/**
 * Valida o header `X-Internal-Secret` contra `INTERNAL_AGENT_API_SECRET`.
 * Falha fechado se o segredo não estiver configurado na API.
 */
export function getInternalSecretConfigured(): boolean {
  return Boolean(process.env.INTERNAL_AGENT_API_SECRET?.trim());
}

export function verifyInternalSecret(headerValue: string | string[] | undefined): boolean {
  const expected = process.env.INTERNAL_AGENT_API_SECRET?.trim();
  if (!expected) return false;
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const provided = raw?.trim();
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
