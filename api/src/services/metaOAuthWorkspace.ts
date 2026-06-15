import type { ContaInstagramInput } from "../store/config.js";
import { loadWorkspaceConfigStore, saveWorkspaceConfig } from "../store/workspace.js";
import type { PageWithInstagram } from "./metaOAuth.js";

/** Grava tokens das páginas retornadas pelo OAuth (token de página = postagem + agente por padrão). */
export async function mergeInstagramPagesIntoWorkspace(orgId: string, pages: PageWithInstagram[]): Promise<void> {
  const withIg = pages.filter((p) => p.instagram_business_account?.id);
  if (withIg.length === 0) {
    throw new Error(
      "Nenhuma página com Instagram Business encontrada. No Meta Business Suite, vincule um Instagram comercial à página e tente de novo."
    );
  }

  const config = await loadWorkspaceConfigStore(orgId);
  const inputs: ContaInstagramInput[] = config.contas_instagram.map((c) => {
    const match = withIg.find((p) => p.instagram_business_account!.id === c.ig_user_id);
    if (!match) return { id: c.id, nome: c.nome, ig_user_id: c.ig_user_id };
    const ig = match.instagram_business_account!;
    const nome = ig.username ? `@${ig.username}` : ig.name || match.name || "Instagram";
    const tok = match.access_token;
    return {
      id: c.id,
      nome,
      ig_user_id: c.ig_user_id,
      facebook_page_id: match.id,
      access_token: tok,
      agent_access_token: tok,
      agent_ativo: c.agent_ativo ?? false,
      agent_nome: c.agent_nome ?? "",
      agent_prompt_comentarios: c.agent_prompt_comentarios ?? "",
      agent_prompt_direct: c.agent_prompt_direct ?? "",
    };
  });

  const knownIg = new Set(config.contas_instagram.map((c) => c.ig_user_id));
  for (const p of withIg) {
    const igId = p.instagram_business_account!.id;
    if (knownIg.has(igId)) continue;
    const ig = p.instagram_business_account!;
    const nome = ig.username ? `@${ig.username}` : ig.name || p.name || "Instagram";
    const tok = p.access_token;
    inputs.push({
      nome,
      ig_user_id: igId,
      facebook_page_id: p.id,
      access_token: tok,
      agent_access_token: tok,
      agent_ativo: false,
      agent_nome: "",
      agent_prompt_comentarios: "",
      agent_prompt_direct: "",
    });
  }

  await saveWorkspaceConfig(orgId, { contas_instagram: inputs });
}
