-- Multi-tenant: Postador por organização + nome único global de instância WhatsApp.

-- Postador: escopo por organization_id
ALTER TABLE postador_cronograma ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE;
ALTER TABLE postador_agendados ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE;

-- Backfill legado: atribui à organização mais antiga (single-tenant histórico)
UPDATE postador_cronograma
SET organization_id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM organizations LIMIT 1);

UPDATE postador_agendados
SET organization_id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM organizations LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_postador_cronograma_org ON postador_cronograma (organization_id);
CREATE INDEX IF NOT EXISTS idx_postador_agendados_org ON postador_agendados (organization_id);

-- WhatsApp: desduplica nomes de instância antes do índice único global
DO $$
DECLARE
  row_rec RECORD;
  suffix text;
BEGIN
  FOR row_rec IN
    SELECT id, instance_name, organization_id,
           ROW_NUMBER() OVER (PARTITION BY instance_name ORDER BY created_at ASC) AS rn
    FROM whatsapp_instances
  LOOP
    IF row_rec.rn > 1 THEN
      suffix := '-' || LEFT(row_rec.organization_id::text, 8);
      UPDATE whatsapp_instances
      SET instance_name = LEFT(row_rec.instance_name, 120 - LENGTH(suffix)) || suffix,
          updated_at = NOW()
      WHERE id = row_rec.id;
    END IF;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instances_name_unique
  ON whatsapp_instances (instance_name);

COMMENT ON INDEX idx_whatsapp_instances_name_unique IS 'Nome Evolution único em todo o sistema (evita colisão multi-tenant no n8n).';
