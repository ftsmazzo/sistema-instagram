import type { ContaInstagram } from "../store/config.js";

/** Resposta pública da API (sem tokens). */
export type ContaInstagramPublic = {
  id: string;
  nome: string;
  ig_user_id: string;
  facebook_page_id: string;
  has_token: boolean;
  has_agent_token: boolean;
  agent_ativo: boolean;
  agent_nome: string;
  agent_prompt_comentarios: string;
  agent_prompt_direct: string;
};

export function toContaInstagramPublic(c: ContaInstagram): ContaInstagramPublic {
  return {
    id: c.id,
    nome: c.nome,
    ig_user_id: c.ig_user_id,
    facebook_page_id: (c.facebook_page_id ?? "").trim(),
    has_token: Boolean(c.access_token?.trim()),
    has_agent_token: Boolean((c.agent_access_token ?? "").trim()),
    agent_ativo: Boolean(c.agent_ativo),
    agent_nome: (c.agent_nome ?? "").trim(),
    agent_prompt_comentarios: (c.agent_prompt_comentarios ?? "").trim(),
    agent_prompt_direct: (c.agent_prompt_direct ?? "").trim(),
  };
}
