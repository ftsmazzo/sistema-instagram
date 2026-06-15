-- ID da Página Facebook vinculada ao Instagram (Private Replies / Messenger API).
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS facebook_page_id text NOT NULL DEFAULT '';

COMMENT ON COLUMN instagram_accounts.facebook_page_id IS 'Page ID Meta para POST /{page_id}/messages (DM e private reply a comentário).';
