-- Memória de chat do agente WhatsApp (n8n Postgres Chat Memory).
-- Instagram continua em n8n_chat_histories (padrão do n8n).
-- Aplicado via ensureTables() na subida da API (espelhado em api/src/db/index.ts).

CREATE TABLE IF NOT EXISTS n8n_chat_histories_wa (
  id         SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  message    JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_n8n_chat_histories_wa_session
  ON n8n_chat_histories_wa (session_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'n8n_chat_histories'
  ) THEN
    INSERT INTO n8n_chat_histories_wa (session_id, message)
    SELECT h.session_id, h.message
    FROM n8n_chat_histories h
    WHERE h.session_id LIKE 'wa:%'
      AND NOT EXISTS (
        SELECT 1 FROM n8n_chat_histories_wa w
        WHERE w.session_id = h.session_id AND w.message = h.message
      );
    DELETE FROM n8n_chat_histories h WHERE h.session_id LIKE 'wa:%';
  END IF;
END $$;

COMMENT ON TABLE n8n_chat_histories_wa IS 'Memória LangChain/n8n do agente WhatsApp (Evolution).';
