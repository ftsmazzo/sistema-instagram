-- Local padrão para compromissos agendados (reunião presencial, videochamada, endereço, etc.)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS agenda_local text NOT NULL DEFAULT '';
