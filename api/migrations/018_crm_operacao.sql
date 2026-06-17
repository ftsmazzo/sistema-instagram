-- CRM operação: notas do consultor e follow-up manual
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_notas TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proximo_followup_em TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_proximo_followup ON leads (organization_id, proximo_followup_em)
  WHERE proximo_followup_em IS NOT NULL;
