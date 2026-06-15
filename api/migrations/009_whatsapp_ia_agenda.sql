-- Agenda da 1ª mensagem proativa da IA no WhatsApp (após boas-vindas).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_ia_agendada_em TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_primeira_ia_enviada BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_wa_agenda ON leads (organization_id, whatsapp_ia_agendada_em)
  WHERE whatsapp_primeira_ia_enviada = false AND whatsapp_boas_vindas_enviado = true;
