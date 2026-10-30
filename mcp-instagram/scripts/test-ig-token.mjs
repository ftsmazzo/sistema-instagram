import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const raw = readFileSync(envPath, "utf8");
const map = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const token = map.INSTAGRAM_ACCESS_TOKEN || "";
const igEnv = map.IG_USER_ID || "";
const ver = (map.META_GRAPH_VERSION || "v25.0").replace(/^v?/, "v");

console.log(
  JSON.stringify({
    token_len: token.length,
    token_prefix: token.slice(0, 6),
    ig_env: igEnv,
  })
);

async function get(host, path) {
  const u = new URL(`https://${host}/${ver}${path.startsWith("/") ? path : `/${path}`}`);
  u.searchParams.set("access_token", token);
  const r = await fetch(u);
  return r.json();
}

const me = await get("graph.instagram.com", "/me?fields=user_id,username,id,name,account_type,media_count,followers_count");
if (me.error) {
  console.log("FAIL_IG_ME", me.error.message, me.error.code);
  const fb = await get("graph.facebook.com", "/me?fields=id,name");
  console.log("FB_ME", JSON.stringify(fb));
  process.exit(1);
}

console.log(
  "OK_ME",
  JSON.stringify({
    id: me.id,
    user_id: me.user_id,
    username: me.username,
    name: me.name,
    account_type: me.account_type,
    media_count: me.media_count,
    followers_count: me.followers_count,
  })
);

const igId = String(me.user_id || me.id);
const media = await get(
  "graph.instagram.com",
  `/${igId}/media?fields=id,caption,media_type,permalink,timestamp&limit=3`
);
if (media.error) {
  console.log("FAIL_MEDIA", media.error.message);
  process.exit(1);
}
const sample = (media.data || []).map((m) => ({
  id: m.id,
  type: m.media_type,
  caption: (m.caption || "").slice(0, 50),
}));
console.log("OK_MEDIA", JSON.stringify(sample));

// Atualiza IG_USER_ID no .env para o user_id oficial (sem tocar no token)
if (me.user_id && me.user_id !== igEnv) {
  const next = raw.replace(/IG_USER_ID=.*/g, `IG_USER_ID=${me.user_id}`);
  writeFileSync(envPath, next);
  console.log("UPDATED_IG_USER_ID", me.user_id);
}
