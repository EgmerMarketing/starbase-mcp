import fs from "fs";
import os from "os";
import path from "path";

/**
 * Shared Starbase OS Supabase project. These are PUBLIC values (the anon role
 * key is meant to ship in client apps; row-level security protects user data),
 * so we bake them in as defaults. A community member then only needs to supply
 * their own refresh token. Both can still be overridden via env if Starbase ever
 * rotates them.
 */
export const DEFAULT_SUPABASE_URL = "https://lophwbygnmaqqutdycsu.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvcGh3Ynlnbm1hcXF1dGR5Y3N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Mzg0MjUsImV4cCI6MjA4MzIxNDQyNX0.Pk0JfaIBxciwpWE0YVYEtseu3BHgiP9JIXXIdF7iQYM";

export const STATE_DIR = path.join(os.homedir(), ".starbase-mcp");
export const CONFIG_FILE = path.join(STATE_DIR, "config.json");
export const SESSION_FILE = path.join(STATE_DIR, "session.json");

export interface StoredConfig {
  refreshToken?: string;
  supabaseUrl?: string;
  anonKey?: string;
}

export interface ResolvedConfig {
  supabaseUrl: string;
  anonKey: string;
  refreshToken: string;
}

function ensureStateDir(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
}

export function loadConfigFile(): StoredConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

export function saveConfigFile(cfg: StoredConfig): void {
  ensureStateDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/**
 * Users may paste any of the following and we will dig out the refresh token:
 *   - the bare refresh token string
 *   - the whole `sb-<ref>-auth-token` localStorage value (a JSON session object)
 *   - that same value prefixed with `base64-` (newer supabase-js storage format)
 */
export function extractRefreshToken(raw: string): string {
  let input = raw.trim();
  if (!input) throw new Error("No token provided.");

  // Strip surrounding quotes a user might copy along with a JSON value.
  if (
    (input.startsWith('"') && input.endsWith('"')) ||
    (input.startsWith("'") && input.endsWith("'"))
  ) {
    input = input.slice(1, -1);
  }

  if (input.startsWith("base64-")) {
    try {
      input = Buffer.from(input.slice("base64-".length), "base64").toString("utf8");
    } catch {
      /* fall through and try to parse as-is */
    }
  }

  // A session object: { access_token, refresh_token, ... } or an array form.
  if (input.startsWith("{") || input.startsWith("[")) {
    try {
      const parsed = JSON.parse(input);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      const token = obj?.refresh_token ?? obj?.currentSession?.refresh_token;
      if (typeof token === "string" && token) return token;
      throw new Error("Could not find a refresh_token inside the pasted session object.");
    } catch (e) {
      throw new Error(
        `That looked like a session object but had no refresh_token in it. ${(e as Error).message}`
      );
    }
  }

  // Otherwise treat it as the raw refresh token.
  return input;
}

/**
 * Resolve the running config. Precedence: explicit env vars > saved config file
 * (written by `login`) > baked-in shared defaults. The refresh token is the only
 * value the user must supply.
 */
export function resolveConfig(): ResolvedConfig {
  const file = loadConfigFile();
  const refreshToken = process.env.STARBASE_REFRESH_TOKEN?.trim() || file.refreshToken;

  if (!refreshToken) {
    throw new Error(
      "No Starbase refresh token found.\n\n" +
        "Run setup once:\n" +
        "  npx github:EgmerMarketing/starbase-mcp login\n\n" +
        "or set STARBASE_REFRESH_TOKEN in your MCP server config. " +
        "See the README for how to copy your token from Starbase."
    );
  }

  return {
    supabaseUrl: process.env.STARBASE_SUPABASE_URL?.trim() || file.supabaseUrl || DEFAULT_SUPABASE_URL,
    anonKey: process.env.STARBASE_SUPABASE_ANON_KEY?.trim() || file.anonKey || DEFAULT_SUPABASE_ANON_KEY,
    refreshToken: extractRefreshToken(refreshToken),
  };
}
