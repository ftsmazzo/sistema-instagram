import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!DATABASE_URL.trim()) {
    throw new Error("DATABASE_URL não configurada");
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

export function isDbConfigured(): boolean {
  return Boolean(DATABASE_URL?.trim());
}

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS postador_cronograma (
  id text PRIMARY KEY,
  caption text NOT NULL,
  media_url text,
  media_type text,
  id_container text,
  link_post text,
  data_post text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS postador_agendados (
  id text PRIMARY KEY,
  caption text NOT NULL,
  media_url text,
  media_urls jsonb,
  media_type text NOT NULL,
  data_agendamento timestamptz,
  conta_id text,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_instagram_account_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_members (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  nome text NOT NULL,
  ig_user_id text NOT NULL,
  access_token text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_org ON instagram_accounts (organization_id);
`;

const MIGRATE_AGENT_COLS = `
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS agent_access_token text NOT NULL DEFAULT '';
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS agent_ativo boolean NOT NULL DEFAULT false;
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS agent_nome text NOT NULL DEFAULT '';
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS agent_prompt_comentarios text NOT NULL DEFAULT '';
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS agent_prompt_direct text NOT NULL DEFAULT '';
`;

const ORG_PROFILE_COLS = `
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nome_fantasia text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS segmento text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cidade text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tom_voz text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sobre text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS objetivo_qualificacao text NOT NULL DEFAULT '';
`;

/** CRM do agente (postagens, comentarios, direct, leads) — mesmo banco da API, escopo por organization_id.
 * Espelha api/migrations/004_agent_crm_tables.sql (deploy só inclui dist; SQL duplicado aqui). */
const AGENT_CRM_SQL = `
CREATE TABLE IF NOT EXISTS postagens (
  id                SERIAL PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  instagram_account_id text NULL REFERENCES instagram_accounts (id) ON DELETE SET NULL,
  id_post           VARCHAR(64) NOT NULL,
  caption_post      TEXT,
  media_type        VARCHAR(32),
  media_url         TEXT,
  link_post         TEXT,
  data_post         TIMESTAMPTZ,
  media_description TEXT,
  hashtags          TEXT,
  mencoes           TEXT,
  processado        BOOLEAN NOT NULL DEFAULT false,
  processado_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT postagens_org_id_post_key UNIQUE (organization_id, id_post)
);
CREATE INDEX IF NOT EXISTS idx_postagens_org ON postagens (organization_id);
CREATE INDEX IF NOT EXISTS idx_postagens_created_at ON postagens (created_at DESC);

CREATE TABLE IF NOT EXISTS comentarios (
  id                         SERIAL PRIMARY KEY,
  organization_id            uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  instagram_account_id       text NULL REFERENCES instagram_accounts (id) ON DELETE SET NULL,
  id_postagem                VARCHAR(64) NOT NULL,
  id_comentario              VARCHAR(64) NOT NULL,
  media_type                 VARCHAR(32),
  id_insta_lead              VARCHAR(64),
  username_lead              VARCHAR(255),
  comment_text               TEXT,
  interaction_type           VARCHAR(64),
  origem                     VARCHAR(64),
  data_comentario            TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  id_direct_resposta_privada VARCHAR(255),
  CONSTRAINT comentarios_org_comment_key UNIQUE (organization_id, id_comentario)
);
CREATE INDEX IF NOT EXISTS idx_comentarios_org ON comentarios (organization_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_data ON comentarios (data_comentario DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_comentarios_postagem ON comentarios (id_postagem);
CREATE INDEX IF NOT EXISTS idx_comentarios_lead ON comentarios (id_insta_lead);

CREATE TABLE IF NOT EXISTS direct (
  id                      SERIAL PRIMARY KEY,
  organization_id         uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  instagram_account_id    text NULL REFERENCES instagram_accounts (id) ON DELETE SET NULL,
  id_direct               VARCHAR(255) NOT NULL,
  id_insta_lead           VARCHAR(64),
  username_lead           VARCHAR(255),
  direct_text             TEXT,
  interaction_type      VARCHAR(64) NOT NULL DEFAULT 'Direct',
  origem                  VARCHAR(64),
  data_direct             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  id_comentario_origem    VARCHAR(64),
  enviado_pelo_negocio    BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT direct_org_message_key UNIQUE (organization_id, id_direct)
);
CREATE INDEX IF NOT EXISTS idx_direct_org ON direct (organization_id);
CREATE INDEX IF NOT EXISTS idx_direct_lead ON direct (id_insta_lead);
CREATE INDEX IF NOT EXISTS idx_direct_data ON direct (data_direct DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS leads (
  id                         SERIAL PRIMARY KEY,
  organization_id            uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  instagram_account_id       text NULL REFERENCES instagram_accounts (id) ON DELETE SET NULL,
  id_instagram               VARCHAR(64) NOT NULL,
  username_instagram         VARCHAR(255),
  nome                       VARCHAR(255),
  whatsapp                   VARCHAR(32),
  objetivo                   VARCHAR(128),
  origem_primeiro_contato    VARCHAR(64),
  profile_pic_url            TEXT,
  seguidores                 INTEGER,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leads_org_instagram_key UNIQUE (organization_id, id_instagram)
);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads (organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads (updated_at DESC);
`;

const MIGRATE_AGENDAMENTO_COLS = `
ALTER TABLE postador_agendados ADD COLUMN IF NOT EXISTS data_agendamento timestamptz;
ALTER TABLE postador_agendados ADD COLUMN IF NOT EXISTS conta_id text;
ALTER TABLE postador_agendados ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';
`;

/** Lead vinculado ao post de origem (disparos segmentados, CRM). */
const MIGRATE_LEADS_POST_ORIGEM = `
ALTER TABLE leads ADD COLUMN IF NOT EXISTS id_post_origem VARCHAR(64);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origem_interacao VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_leads_post_origem ON leads (organization_id, id_post_origem);
`;

/** Agente WhatsApp — espelha api/migrations/007_whatsapp_agent.sql */
const WHATSAPP_AGENT_SQL = `
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  instance_name       VARCHAR(128) NOT NULL,
  evolution_base_url  TEXT NOT NULL DEFAULT '',
  agent_ativo         BOOLEAN NOT NULL DEFAULT false,
  agent_nome          VARCHAR(255) NOT NULL DEFAULT '',
  agent_prompt        TEXT NOT NULL DEFAULT '',
  objetivos           JSONB NOT NULL DEFAULT '["link_produto","agendar_visita","handoff_humano"]'::jsonb,
  status              VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_instances_org_instance_key UNIQUE (organization_id, instance_name)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_org ON whatsapp_instances (organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_name ON whatsapp_instances (instance_name);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                SERIAL PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  lead_id           INTEGER NULL REFERENCES leads (id) ON DELETE SET NULL,
  telefone          VARCHAR(32) NOT NULL,
  direction         VARCHAR(16) NOT NULL DEFAULT 'inbound',
  message_text      TEXT,
  message_id_ext    VARCHAR(255),
  instance_name     VARCHAR(128),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_org_phone ON whatsapp_messages (organization_id, telefone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON whatsapp_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS visitas (
  id                SERIAL PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  lead_id           INTEGER NULL REFERENCES leads (id) ON DELETE SET NULL,
  telefone          VARCHAR(32) NOT NULL,
  id_post_origem    VARCHAR(64),
  url_interesse     TEXT,
  data_visita       TIMESTAMPTZ,
  status            VARCHAR(32) NOT NULL DEFAULT 'agendada',
  observacoes       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visitas_org ON visitas (organization_id);
CREATE INDEX IF NOT EXISTS idx_visitas_lead ON visitas (lead_id);
CREATE INDEX IF NOT EXISTS idx_visitas_data ON visitas (data_visita);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'novo';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS url_interesse TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS handoff_motivo TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_boas_vindas_enviado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_digits VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_digits ON leads (organization_id, whatsapp_digits);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (organization_id, status);
`;

let initDone = false;

export async function ensureTables(): Promise<void> {
  if (!isDbConfigured() || initDone) return;
  const p = getPool();
  await p.query(INIT_SQL);
  await p.query(MIGRATE_AGENT_COLS);
  await p.query(ORG_PROFILE_COLS);
  await p.query(AGENT_CRM_SQL);
  await p.query(MIGRATE_AGENDAMENTO_COLS);
  await p.query(MIGRATE_LEADS_POST_ORIGEM);
  await p.query(WHATSAPP_AGENT_SQL);
  initDone = true;
}
