-- Agente WhatsApp: instância Evolution, mensagens, visitas e extensão de leads.
-- Escopo multi-tenant por organization_id.

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
  delay_primeira_msg_minutos INTEGER NOT NULL DEFAULT 20,
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
