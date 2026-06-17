-- Mensagens de follow-up WhatsApp agendadas pelo CRM (retomada de venda)
CREATE TABLE IF NOT EXISTS crm_followup_mensagens (
  id                SERIAL PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  lead_id           INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  telefone          VARCHAR(32) NOT NULL,
  message_text      TEXT NOT NULL,
  agendado_para      TIMESTAMPTZ NOT NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'pendente',
  criado_por        VARCHAR(64) NOT NULL DEFAULT 'consultor',
  origin_hint       VARCHAR(128),
  error_message     TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_followup_org_status_agenda
  ON crm_followup_mensagens (organization_id, status, agendado_para);

CREATE INDEX IF NOT EXISTS idx_crm_followup_lead
  ON crm_followup_mensagens (lead_id, status, agendado_para);
