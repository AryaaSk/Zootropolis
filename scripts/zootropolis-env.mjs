#!/usr/bin/env node
/**
 * Parse zootropolis.config.json → print `KEY=VALUE` lines for every env
 * var the config maps to. `scripts/dev.sh` sources this output.
 *
 * Precedence: existing shell env vars WIN over the file. We only emit
 * mappings for keys that aren't already set, so `FOO=bar ./scripts/dev.sh`
 * and other per-run overrides still work.
 *
 * Missing config file → no output, no error. Missing fields → env var
 * just isn't emitted (Paperclip / broker / adapter defaults kick in).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "..", "zootropolis.config.json");

if (!existsSync(CONFIG_PATH)) {
  process.exit(0);
}

let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
} catch (err) {
  process.stderr.write(`zootropolis.config.json is not valid JSON: ${err.message}\n`);
  process.exit(2);
}

const out = [];
function emit(envKey, value) {
  if (value === undefined || value === null || value === "") return;
  if (process.env[envKey]) return; // existing env wins
  // Shell-quote in case the value has spaces / tildes / special chars.
  const quoted = String(value).replace(/'/g, "'\\''");
  out.push(`export ${envKey}='${quoted}'`);
}

emit(
  "ZOOTROPOLIS_DELEGATION_STRICT",
  cfg?.delegation?.strict === true ? "true"
    : cfg?.delegation?.strict === false ? "false"
    : undefined,
);
// Phase Z — aliaskit.useReal removed. Identity is no longer a server
// concern; remote workers (leaf agents) run their own AliasKit skill
// locally on their VM.

process.stdout.write(out.join("\n") + (out.length > 0 ? "\n" : ""));
