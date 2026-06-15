/** Normaliza telefone BR para dígitos com prefixo 55 (Evolution API). */
export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12) return null;
  return digits;
}

/** Extrai número de remoteJid Evolution (@s.whatsapp.net). */
export function phoneFromEvolutionJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const local = jid.split("@")[0]?.trim() ?? "";
  return normalizePhoneDigits(local);
}
