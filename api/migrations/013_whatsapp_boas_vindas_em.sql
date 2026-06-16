-- Momento em que a boas-vindas foi enviada no WhatsApp (âncora do delay da 1ª msg proativa).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_boas_vindas_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_wa_boas_vindas_em ON leads (organization_id, whatsapp_boas_vindas_em)
  WHERE whatsapp_boas_vindas_enviado = true AND whatsapp_primeira_ia_enviada = false;

COMMENT ON COLUMN leads.whatsapp_boas_vindas_em IS 'Timestamp da msg de boas-vindas no Zap; usado para agendar 1ª msg proativa da IA.';
