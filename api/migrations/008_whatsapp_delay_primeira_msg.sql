-- Minutos após boas-vindas antes da 1ª mensagem proativa da IA no WhatsApp (0 = imediato).
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS delay_primeira_msg_minutos INTEGER NOT NULL DEFAULT 20;
