-- Brand kit do Postador (paleta + logo) por organização
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS postador_brand_kit jsonb NOT NULL DEFAULT '{}'::jsonb;
