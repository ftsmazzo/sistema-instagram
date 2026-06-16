-- Fila inbound WhatsApp (audit Postgres) + debounce coordenado via Redis na API.
-- Aplicado via ensureTables() na subida da API (espelhado em api/src/db/index.ts).

CREATE TABLE IF NOT EXISTS whatsapp_inbound_queue (
  id                SERIAL PRIMARY KEY,
  organization_id   uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  instance_name     VARCHAR(128) NOT NULL,
  telefone          VARCHAR(32) NOT NULL,
  message_id_ext    VARCHAR(255),
  message_text      TEXT NOT NULL,
  batch_key         VARCHAR(128) NOT NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'queued',
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  debounce_until    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_queue_batch_status
  ON whatsapp_inbound_queue (batch_key, status, debounce_until);

CREATE INDEX IF NOT EXISTS idx_wa_inbound_queue_org_phone
  ON whatsapp_inbound_queue (organization_id, telefone, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_inbound_queue_dedup
  ON whatsapp_inbound_queue (organization_id, message_id_ext)
  WHERE message_id_ext IS NOT NULL AND message_id_ext <> '';

COMMENT ON TABLE whatsapp_inbound_queue IS 'Fila auditável de mensagens inbound WA antes do agente IA (debounce via Redis).';
