-- Score de conversão persistente por lead (0–100)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_score smallint;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_score_label VARCHAR(16);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_score_motivo TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crm_score_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_crm_score ON leads (organization_id, crm_score DESC NULLS LAST)
  WHERE status NOT IN ('convertido', 'perdido');
