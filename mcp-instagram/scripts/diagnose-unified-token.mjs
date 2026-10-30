import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(resolve(root, ".env"), "utf8");
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
const ver = "v26.0";
const base = `https://graph.facebook.com/${ver}`;

async function get(path) {
  const u = new URL(base + path);
  u.searchParams.set("access_token", token);
  const r = await fetch(u);
  return r.json();
}

const me = await get("/me?fields=id,name,client_business_id");
console.log("me=", JSON.stringify(me));

for (const p of [
  "/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}",
  "/me/assigned_pages?fields=id,name,instagram_business_account{id,username}",
  "/me/assigned_instagram_accounts?fields=id,username",
]) {
  const j = await get(p);
  if (j.error) console.log(p, "ERR", j.error.message);
  else {
    const data = (j.data || []).map((x) => ({
      id: x.id,
      name: x.name,
      username: x.username,
      ig: x.instagram_business_account || null,
      has_page_token: Boolean(x.access_token),
    }));
    console.log(p, JSON.stringify({ count: data.length, data }));
  }
}
