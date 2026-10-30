import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(resolve(root, ".env"), "utf8");
const line = raw.split(/\r?\n/).find((l) => l.startsWith("INSTAGRAM_ACCESS_TOKEN=")) || "";
const t = line.slice("INSTAGRAM_ACCESS_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
console.log(
  JSON.stringify({
    len: t.length,
    prefix: t.slice(0, 8),
    has_whitespace: /\s/.test(t),
    has_quotes_in_value: /["']/.test(line.slice("INSTAGRAM_ACCESS_TOKEN=".length)),
  })
);
