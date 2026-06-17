-- Cadência automática de follow-up WhatsApp + alertas consultor
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS crm_cadencia_config jsonb NOT NULL DEFAULT '{
  "ativo": true,
  "horas_sem_resposta": 24,
  "alerta_consultor_horas": 12,
  "etapas": [
    {"horas_apos_parada": 24, "mensagem": "Oi {nome}! Passando para saber se ainda posso te ajudar com {objetivo}. Qual seria o melhor próximo passo pra você?"},
    {"horas_apos_parada": 72, "mensagem": "Oi {nome}, tudo bem? Nossa conversa sobre {objetivo} ficou pendente. Ainda faz sentido retomarmos?"},
    {"horas_apos_parada": 168, "mensagem": "Último contato por aqui, {nome}. Se ainda tiver interesse em {objetivo}, é só responder — fico à disposição."}
  ]
}'::jsonb;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_cadencia_serie_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_cadencia_pausada boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS handoff_alerta_em timestamptz;

ALTER TABLE crm_followup_mensagens ADD COLUMN IF NOT EXISTS serie_id uuid;
ALTER TABLE crm_followup_mensagens ADD COLUMN IF NOT EXISTS etapa smallint;
ALTER TABLE crm_followup_mensagens ADD COLUMN IF NOT EXISTS alerta_consultor_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_crm_followup_serie ON crm_followup_mensagens (serie_id) WHERE serie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_cadencia_serie ON leads (organization_id, crm_cadencia_serie_id) WHERE crm_cadencia_serie_id IS NOT NULL;
