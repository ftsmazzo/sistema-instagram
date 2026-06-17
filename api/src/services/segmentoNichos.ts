/**
 * Keywords compartilhadas para match de nicho (cadência, qualificação, Postador).
 * Ordem de prioridade nos registries: nichos específicos antes de servicos_b2b genérico.
 */

export const BELEZA_SEGMENTO_KEYWORDS = [
  "beleza",
  "barbearia",
  "barber",
  "salão",
  "salao",
  "estética",
  "estetica",
  "cabeleir",
  "manicure",
  "unha",
  "spa",
  "sobrancelha",
  "depila",
  "make",
  "maquiagem",
  "harmonização",
  "harmonizacao",
  "skincare",
  "cabelo",
] as const;

export const PROFISSIONAIS_SEGMENTO_KEYWORDS = [
  "advogad",
  "jurídic",
  "juridic",
  "contab",
  "contador",
  "escritório contábil",
  "escritorio contabil",
  "contabilidade",
  "notarial",
  "cartório",
  "cartorio",
  "engenheir",
  "arquitet",
  "corretor de seguro",
  "consultor financeiro",
] as const;

export function normalizeSegmento(raw: string): string {
  return raw.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function segmentoMatchesKeywords(segmento: string, keywords: readonly string[]): boolean {
  const s = normalizeSegmento(segmento);
  if (!s.trim()) return false;
  return keywords.some((k) => s.includes(normalizeSegmento(k)));
}
