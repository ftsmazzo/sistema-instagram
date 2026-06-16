-- Telefone do consultor humano para alerta de lead qualificado (WhatsApp via Evolution).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS handoff_whatsapp text NOT NULL DEFAULT '';
