import dotenv from "dotenv";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, ".env");

// Use configDotenv (not config): dotenv v17's `config()` switches to encrypted .env.vault when
// DOTENV_KEY is set globally, ignoring `path` — which can leave SKIP_DATABASE=true from an old vault.
dotenv.configDotenv({ path: envPath, override: true });

/**
 * Single source of truth for “skip Mongo”: plaintext server/.env only (not vault / OS env).
 */
let skipDatabaseRequested = false;

export function getSkipDatabaseRequested() {
  return skipDatabaseRequested;
}

function normalizeSkipDatabaseFromFile() {
  skipDatabaseRequested = false;

  if (!existsSync(envPath)) {
    process.env.SKIP_DATABASE = "false";
    return;
  }

  const raw = readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  let last = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^SKIP_DATABASE\s*=\s*(.*)$/i);
    if (!m) continue;
    let val = m[1].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    last = val;
  }

  if (last !== null) {
    skipDatabaseRequested = /^true$/i.test(last.trim());
  }
  process.env.SKIP_DATABASE = skipDatabaseRequested ? "true" : "false";
}

normalizeSkipDatabaseFromFile();
