-- Link padrão, agenda de compromissos e critérios de qualificação (multi-segmento)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS link_produto_servico text NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS agenda_config jsonb NOT NULL DEFAULT '{"dias_semana":[1,2,3,4,5],"horario_inicio":"09:00","horario_fim":"18:00","duracao_minutos":60}'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS criterios_qualificacao text NOT NULL DEFAULT '';
