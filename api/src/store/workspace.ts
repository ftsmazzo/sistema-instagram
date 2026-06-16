import { getPool, isDbConfigured, ensureTables } from "../db/index.js";
import { parseAgendaConfig } from "../services/empresaConfigHelpers.js";
import { parsePostadorBrandKit } from "../services/postadorBrand.js";
import type { ConfigStore, ContaInstagram, ContaInstagramInput, EmpresaPerfil } from "./config.js";

function genAccountId(): string {
  return `conta-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function countUsers(): Promise<number> {
  if (!isDbConfigured()) return 0;
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM users");
  return Number(r.rows[0]?.n ?? 0);
}

export async function userHasOrg(userId: string): Promise<{ orgId: string } | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ organization_id: string }>(
    "SELECT organization_id FROM org_members WHERE user_id = $1 ORDER BY created_at LIMIT 1",
    [userId]
  );
  const row = r.rows[0];
  return row ? { orgId: row.organization_id } : null;
}

export async function userBelongsToOrg(userId: string, orgId: string): Promise<boolean> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ ok: string }>(
    "SELECT 1::text AS ok FROM org_members WHERE user_id = $1 AND organization_id = $2::uuid LIMIT 1",
    [userId, orgId]
  );
  return Boolean(r.rows[0]);
}

/** Config no mesmo formato do legado `app_config`, montado a partir do workspace. */
export async function loadWorkspaceConfigStore(orgId: string): Promise<ConfigStore> {
  await ensureTables();
  const pool = getPool();
  const org = await pool.query<{
    name: string;
    default_instagram_account_id: string | null;
    nome_fantasia: string;
    segmento: string;
    cidade: string;
    tom_voz: string;
    sobre: string;
    objetivo_qualificacao: string;
    handoff_whatsapp: string;
    link_produto_servico: string;
    agenda_config: unknown;
    criterios_qualificacao: string;
    agenda_local: string;
    postador_brand_kit: unknown;
  }>(
    `SELECT name, default_instagram_account_id,
            COALESCE(nome_fantasia, '') AS nome_fantasia,
            COALESCE(segmento, '') AS segmento,
            COALESCE(cidade, '') AS cidade,
            COALESCE(tom_voz, '') AS tom_voz,
            COALESCE(sobre, '') AS sobre,
            COALESCE(objetivo_qualificacao, '') AS objetivo_qualificacao,
            COALESCE(handoff_whatsapp, '') AS handoff_whatsapp,
            COALESCE(link_produto_servico, '') AS link_produto_servico,
            COALESCE(agenda_config, '{"dias_semana":[1,2,3,4,5],"horario_inicio":"09:00","horario_fim":"18:00","duracao_minutos":60}'::jsonb) AS agenda_config,
            COALESCE(criterios_qualificacao, '') AS criterios_qualificacao,
            COALESCE(agenda_local, '') AS agenda_local,
            COALESCE(postador_brand_kit, '{}'::jsonb) AS postador_brand_kit
     FROM organizations WHERE id = $1`,
    [orgId]
  );
  if (org.rows.length === 0) {
    const empty: EmpresaPerfil = {
      nome: "",
      nome_fantasia: "",
      segmento: "",
      cidade: "",
      tom_voz: "",
      sobre: "",
      objetivo_qualificacao: "",
      handoff_whatsapp: "",
      link_produto_servico: "",
      agenda_config: parseAgendaConfig(null),
      criterios_qualificacao: "",
      agenda_local: "",
    };
    return { empresa: empty, contas_instagram: [], instagram_default_id: null };
  }
  const acc = await pool.query<{
    id: string;
    nome: string;
    ig_user_id: string;
    access_token: string;
    agent_access_token: string;
    facebook_page_id: string;
    agent_ativo: boolean;
    agent_nome: string;
    agent_prompt_comentarios: string;
    agent_prompt_direct: string;
  }>(
    `SELECT id, nome, ig_user_id, access_token,
            COALESCE(facebook_page_id, '') AS facebook_page_id,
            COALESCE(agent_access_token, '') AS agent_access_token,
            COALESCE(agent_ativo, false) AS agent_ativo,
            COALESCE(agent_nome, '') AS agent_nome,
            COALESCE(agent_prompt_comentarios, '') AS agent_prompt_comentarios,
            COALESCE(agent_prompt_direct, '') AS agent_prompt_direct
     FROM instagram_accounts WHERE organization_id = $1 ORDER BY created_at`,
    [orgId]
  );
  const contas: ContaInstagram[] = acc.rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    ig_user_id: r.ig_user_id,
    facebook_page_id: r.facebook_page_id ?? "",
    access_token: r.access_token ?? "",
    agent_access_token: r.agent_access_token ?? "",
    agent_ativo: r.agent_ativo ?? false,
    agent_nome: r.agent_nome ?? "",
    agent_prompt_comentarios: r.agent_prompt_comentarios ?? "",
    agent_prompt_direct: r.agent_prompt_direct ?? "",
  }));
  let defaultId = org.rows[0].default_instagram_account_id;
  if (defaultId && !contas.some((c) => c.id === defaultId)) defaultId = contas[0]?.id ?? null;
  if (!defaultId && contas[0]) defaultId = contas[0].id;
  const r = org.rows[0];
  const brandParsed = parsePostadorBrandKit(r.postador_brand_kit);
  const empresa: EmpresaPerfil = {
    nome: r.name,
    nome_fantasia: r.nome_fantasia ?? "",
    segmento: r.segmento ?? "",
    cidade: r.cidade ?? "",
    tom_voz: r.tom_voz ?? "",
    sobre: r.sobre ?? "",
    objetivo_qualificacao: r.objetivo_qualificacao ?? "",
    handoff_whatsapp: r.handoff_whatsapp ?? "",
    link_produto_servico: r.link_produto_servico ?? "",
    agenda_config: parseAgendaConfig(r.agenda_config),
    criterios_qualificacao: r.criterios_qualificacao ?? "",
    agenda_local: r.agenda_local ?? "",
    postador_brand: brandParsed ?? undefined,
  };
  return {
    empresa,
    contas_instagram: contas,
    instagram_default_id: defaultId,
  };
}

export async function saveWorkspaceConfig(
  orgId: string,
  partial: {
    empresa?: Partial<EmpresaPerfil>;
    contas_instagram?: ContaInstagramInput[];
    instagram_default_id?: string | null;
  }
): Promise<ConfigStore> {
  await ensureTables();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orgCheck = await client.query("SELECT id FROM organizations WHERE id = $1", [orgId]);
    if (orgCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("Organização não encontrada.");
    }

    if (partial.empresa) {
      const e = partial.empresa;
      const sets: { col: string; val: string | ReturnType<typeof parseAgendaConfig> }[] = [];
      if (e.nome !== undefined) sets.push({ col: "name", val: e.nome.trim() || "Empresa" });
      if (e.nome_fantasia !== undefined) sets.push({ col: "nome_fantasia", val: (e.nome_fantasia ?? "").trim() });
      if (e.segmento !== undefined) sets.push({ col: "segmento", val: (e.segmento ?? "").trim() });
      if (e.cidade !== undefined) sets.push({ col: "cidade", val: (e.cidade ?? "").trim() });
      if (e.tom_voz !== undefined) sets.push({ col: "tom_voz", val: (e.tom_voz ?? "").trim() });
      if (e.sobre !== undefined) sets.push({ col: "sobre", val: (e.sobre ?? "").trim() });
      if (e.objetivo_qualificacao !== undefined)
        sets.push({ col: "objetivo_qualificacao", val: (e.objetivo_qualificacao ?? "").trim() });
      if (e.handoff_whatsapp !== undefined)
        sets.push({ col: "handoff_whatsapp", val: (e.handoff_whatsapp ?? "").trim() });
      if (e.link_produto_servico !== undefined)
        sets.push({ col: "link_produto_servico", val: (e.link_produto_servico ?? "").trim() });
      if (e.agenda_config !== undefined)
        sets.push({ col: "agenda_config", val: parseAgendaConfig(e.agenda_config) });
      if (e.criterios_qualificacao !== undefined)
        sets.push({ col: "criterios_qualificacao", val: (e.criterios_qualificacao ?? "").trim() });
      if (e.agenda_local !== undefined)
        sets.push({ col: "agenda_local", val: (e.agenda_local ?? "").trim() });
      if (e.postador_brand !== undefined) {
        sets.push({ col: "postador_brand_kit", val: JSON.stringify(e.postador_brand ?? {}) });
      }
      if (sets.length > 0) {
        const placeholders = sets.map((s, idx) => `${s.col} = $${idx + 1}`).join(", ");
        await client.query(`UPDATE organizations SET ${placeholders} WHERE id = $${sets.length + 1}`, [
          ...sets.map((s) => s.val),
          orgId,
        ]);
      }
    }

    const currentRows = await client.query<{
      id: string;
      access_token: string;
      agent_access_token: string;
      facebook_page_id: string;
      agent_ativo: boolean;
      agent_nome: string;
      agent_prompt_comentarios: string;
      agent_prompt_direct: string;
    }>(
      `SELECT id, access_token,
              COALESCE(facebook_page_id, '') AS facebook_page_id,
              COALESCE(agent_access_token, '') AS agent_access_token,
              COALESCE(agent_ativo, false) AS agent_ativo,
              COALESCE(agent_nome, '') AS agent_nome,
              COALESCE(agent_prompt_comentarios, '') AS agent_prompt_comentarios,
              COALESCE(agent_prompt_direct, '') AS agent_prompt_direct
       FROM instagram_accounts WHERE organization_id = $1`,
      [orgId]
    );
    type ExistingAcc = {
      access_token: string;
      agent_access_token: string;
      facebook_page_id: string;
      agent_ativo: boolean;
      agent_nome: string;
      agent_prompt_comentarios: string;
      agent_prompt_direct: string;
    };
    const existingById = new Map<string, ExistingAcc>(
      currentRows.rows.map((r) => [
        r.id,
        {
          access_token: r.access_token,
          agent_access_token: r.agent_access_token,
          facebook_page_id: r.facebook_page_id,
          agent_ativo: r.agent_ativo,
          agent_nome: r.agent_nome,
          agent_prompt_comentarios: r.agent_prompt_comentarios,
          agent_prompt_direct: r.agent_prompt_direct,
        },
      ])
    );

    if (partial.contas_instagram) {
      const input = partial.contas_instagram;
      const nextIds = new Set<string>();
      for (const c of input) {
        let id = c.id?.trim() || genAccountId();
        if (c.id?.trim()) {
          const row = await client.query<{ organization_id: string }>(
            "SELECT organization_id FROM instagram_accounts WHERE id = $1",
            [c.id.trim()]
          );
          if (row.rows.length > 0 && row.rows[0].organization_id !== orgId) {
            id = genAccountId();
          }
        }
        nextIds.add(id);
        const existing = existingById.get(id);
        const token = (c.access_token?.trim() || existing?.access_token) ?? "";
        const agentTok = (c.agent_access_token?.trim() || existing?.agent_access_token) ?? "";
        const nome = (c.nome ?? "").trim() || "Conta";
        const igUser = (c.ig_user_id ?? "").trim();
        const pageId = (c.facebook_page_id?.trim() || existing?.facebook_page_id) ?? "";
        const isUpdate = existing !== undefined;
        const agentAtivo = isUpdate
          ? c.agent_ativo !== undefined
            ? Boolean(c.agent_ativo)
            : existing.agent_ativo
          : Boolean(c.agent_ativo);
        const agentNome = isUpdate
          ? c.agent_nome !== undefined
            ? (c.agent_nome ?? "").trim()
            : existing.agent_nome
          : (c.agent_nome ?? "").trim();
        const pCom = isUpdate
          ? c.agent_prompt_comentarios !== undefined
            ? (c.agent_prompt_comentarios ?? "").trim()
            : existing.agent_prompt_comentarios
          : (c.agent_prompt_comentarios ?? "").trim();
        const pDir = isUpdate
          ? c.agent_prompt_direct !== undefined
            ? (c.agent_prompt_direct ?? "").trim()
            : existing.agent_prompt_direct
          : (c.agent_prompt_direct ?? "").trim();
        const own = await client.query("SELECT 1 FROM instagram_accounts WHERE id = $1 AND organization_id = $2", [id, orgId]);
        if (own.rows.length > 0) {
          await client.query(
            `UPDATE instagram_accounts SET
               nome = $3, ig_user_id = $4,
               access_token = CASE WHEN $5 <> '' THEN $5 ELSE access_token END,
               agent_access_token = CASE WHEN $6 <> '' THEN $6 ELSE agent_access_token END,
               facebook_page_id = CASE WHEN $7 <> '' THEN $7 ELSE facebook_page_id END,
               agent_ativo = $8,
               agent_nome = $9,
               agent_prompt_comentarios = $10,
               agent_prompt_direct = $11
             WHERE id = $1 AND organization_id = $2`,
            [id, orgId, nome, igUser, token, agentTok, pageId, agentAtivo, agentNome, pCom, pDir]
          );
        } else {
          await client.query(
            `INSERT INTO instagram_accounts (
               id, organization_id, nome, ig_user_id, access_token,
               agent_access_token, facebook_page_id, agent_ativo, agent_nome, agent_prompt_comentarios, agent_prompt_direct
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, orgId, nome, igUser, token, agentTok, pageId, agentAtivo, agentNome, pCom, pDir]
          );
        }
      }
      const toDelete = [...existingById.keys()].filter((id) => !nextIds.has(id));
      for (const id of toDelete) {
        await client.query("DELETE FROM instagram_accounts WHERE id = $1 AND organization_id = $2", [id, orgId]);
      }
    }

    if (partial.instagram_default_id !== undefined) {
      const def = partial.instagram_default_id?.trim() || null;
      await client.query("UPDATE organizations SET default_instagram_account_id = $2 WHERE id = $1", [orgId, def]);
    }

    await client.query("COMMIT");
    return loadWorkspaceConfigStore(orgId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function createUserWithOrganization(
  email: string,
  passwordHash: string,
  organizationName: string
): Promise<{ userId: string; orgId: string }> {
  await ensureTables();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [email.toLowerCase().trim(), passwordHash]
    );
    const userId = u.rows[0].id;
    const o = await client.query<{ id: string }>(
      "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
      [organizationName.trim() || "Minha empresa"]
    );
    const orgId = o.rows[0].id;
    await client.query(
      "INSERT INTO org_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
      [orgId, userId]
    );
    await client.query("COMMIT");
    return { userId, orgId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function findUserByEmail(email: string): Promise<{ id: string; password_hash: string } | null> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email.toLowerCase().trim()]
  );
  return r.rows[0] ?? null;
}

/** Copia contas do app_config legado para o workspace (uma vez, no registro inicial). */
export async function copyLegacyConfigIntoWorkspace(orgId: string): Promise<void> {
  await ensureTables();
  const pool = getPool();
  const r = await pool.query<{ value: unknown }>("SELECT value FROM app_config WHERE key = 'config'");
  if (r.rows.length === 0) return;
  const value = r.rows[0].value as {
    empresa?: { nome?: string };
    contas_instagram?: Array<{ id?: string; nome?: string; ig_user_id?: string; access_token?: string }>;
    instagram_default_id?: string | null;
  };
  const contas = value.contas_instagram;
  if (!Array.isArray(contas) || contas.length === 0) return;

  const existing = await pool.query("SELECT 1 FROM instagram_accounts WHERE organization_id = $1 LIMIT 1", [orgId]);
  if (existing.rows.length > 0) return;

  if (value.empresa?.nome) {
    await pool.query("UPDATE organizations SET name = $2 WHERE id = $1", [orgId, value.empresa.nome]);
  }

  let defaultId: string | null = null;
  for (const c of contas) {
    const id = (c.id?.trim() || genAccountId()) as string;
    await pool.query(
      `INSERT INTO instagram_accounts (id, organization_id, nome, ig_user_id, access_token)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, orgId, (c.nome ?? "Conta").trim(), (c.ig_user_id ?? "").trim(), (c.access_token ?? "").trim()]
    );
    if (value.instagram_default_id && value.instagram_default_id === c.id) {
      defaultId = id;
    }
  }
  if (!defaultId && contas.length) {
    const first = await pool.query<{ id: string }>(
      "SELECT id FROM instagram_accounts WHERE organization_id = $1 ORDER BY created_at LIMIT 1",
      [orgId]
    );
    defaultId = first.rows[0]?.id ?? null;
  }
  if (defaultId) {
    await pool.query("UPDATE organizations SET default_instagram_account_id = $2 WHERE id = $1", [orgId, defaultId]);
  }
}
