-- Vínculo lead ↔ postagem de origem (comentário/Direct) para segmentação e disparos.
-- Aplicado via ensureTables() na API (espelhado em api/src/db/index.ts).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS id_post_origem VARCHAR(64);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origem_interacao VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_leads_post_origem ON leads (organization_id, id_post_origem);

COMMENT ON COLUMN leads.id_post_origem IS 'id_post Meta/Instagram do post que originou o lead (comentário ou contexto Direct).';
COMMENT ON COLUMN leads.origem_interacao IS 'Primeira interação: comment, direct, etc.';
