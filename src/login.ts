import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  CONFIG_FILE,
  extractRefreshToken,
  saveConfigFile,
} from "./config.js";
import { TokenManager } from "./token-manager.js";

const GITHUB_SPEC = "github:EgmerMarketing/starbase-mcp";

function authConfig() {
  return {
    supabaseUrl: process.env.STARBASE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL,
    anonKey: process.env.STARBASE_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY,
  };
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    })
  );
}

function out(s: string): void {
  process.stderr.write(s);
}

type Session = { refreshToken: string; userId?: string; email?: string };

/** Ask Starbase to email a sign-in link (and/or code) to this address. */
async function requestLoginEmail(email: string): Promise<void> {
  const { supabaseUrl, anonKey } = authConfig();
  const res = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    // create_user:false => never create a new account from a typo; only existing Starbase users.
    body: JSON.stringify({ email, create_user: false }),
  });
  if (res.status === 429) {
    throw new Error(
      "Starbase is rate-limiting login emails right now (their email is in test mode, only a few " +
        "per hour). Wait a few minutes and try again, or sign in with a token: `login --token`."
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Could not send a login email (HTTP ${res.status}). ${body}`);
  }
}

function sessionFromParams(params: URLSearchParams): Session | null {
  const refreshToken = params.get("refresh_token");
  if (!refreshToken) return null;
  return { refreshToken };
}

/**
 * Complete sign-in from whatever the user pastes out of the email:
 *   - a full magic-link URL (we replay it and read the session from the redirect)
 *   - a numeric code, if Starbase's template ever sends one
 */
async function completeFromInput(email: string, input: string): Promise<Session> {
  const value = input.trim();
  const { supabaseUrl, anonKey } = authConfig();

  // Magic link: replay it server-side; the session rides in the redirect fragment.
  if (/^https?:\/\//i.test(value)) {
    const res = await fetch(value, { method: "GET", redirect: "manual", headers: { apikey: anonKey } });
    const loc = res.headers.get("location") || "";
    const frag = loc.includes("#") ? loc.split("#")[1] : loc.split("?")[1] || "";
    const params = new URLSearchParams(frag);
    if (params.get("error") || params.get("error_code")) {
      throw new Error(
        `That link didn't work (${params.get("error_description") || params.get("error_code")}). ` +
          "Magic links are single-use and expire fast, so request a fresh email."
      );
    }
    const session = sessionFromParams(params);
    if (!session) throw new Error("Couldn't read a session from that link. Paste the full sign-in link from the email.");
    return session;
  }

  // Numeric code fallback.
  if (/^\d{4,8}$/.test(value)) {
    const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", email, token: value }),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok || !data?.refresh_token) {
      const msg = data?.msg || data?.error_description || data?.error || `HTTP ${res.status}`;
      throw new Error(`That code didn't work (${msg}). Codes expire quickly; request a fresh one.`);
    }
    return { refreshToken: data.refresh_token, userId: data.user?.id, email: data.user?.email };
  }

  throw new Error("Paste the sign-in link from the email (it starts with https://).");
}

/** Path to the Claude Desktop config for this OS, or null if unknown. */
function claudeDesktopConfigPath(): string | null {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "win32":
      return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    default:
      return path.join(home, ".config", "Claude", "claude_desktop_config.json");
  }
}

/**
 * Merge a `starbase` entry into the user's Claude Desktop config so they never
 * have to hand-edit JSON. Returns true if written. Only touches the file when
 * Claude Desktop is actually installed (its config dir exists).
 */
function writeClaudeDesktopConfig(): boolean {
  const cfgPath = claudeDesktopConfigPath();
  if (!cfgPath || !fs.existsSync(path.dirname(cfgPath))) return false;

  let config: any = {};
  if (fs.existsSync(cfgPath)) {
    try {
      config = JSON.parse(fs.readFileSync(cfgPath, "utf8")) || {};
      // Keep a one-time backup before we modify an existing config.
      if (!fs.existsSync(`${cfgPath}.bak`)) fs.copyFileSync(cfgPath, `${cfgPath}.bak`);
    } catch {
      return false; // don't clobber a file we can't parse
    }
  }

  config.mcpServers = config.mcpServers || {};
  config.mcpServers.starbase = { command: "npx", args: ["-y", GITHUB_SPEC] };
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
  return true;
}

async function persistAndWire(refreshToken: string, userId?: string, email?: string): Promise<void> {
  saveConfigFile({ refreshToken });
  out(`\n✓ Signed in${email ? ` as ${email}` : ""}${userId ? ` (user ${userId})` : ""}.\n`);
  out(`  Credentials saved to ${CONFIG_FILE}\n`);

  if (writeClaudeDesktopConfig()) {
    out(`✓ Added "starbase" to Claude Desktop. Fully restart Claude Desktop (quit and reopen) to finish.\n\n`);
  } else {
    out(
      `\nTo connect it, run this one command if you use Claude Code:\n` +
        `  claude mcp add starbase -- npx -y ${GITHUB_SPEC}\n\n` +
        `Or add this to your Claude Desktop config and restart:\n` +
        `  { "mcpServers": { "starbase": { "command": "npx", "args": ["-y", "${GITHUB_SPEC}"] } } }\n\n`
    );
  }
}

/**
 * Frictionless setup. Default: email + 6-digit code (no password, no DevTools).
 * Fallback for advanced users: `login --token <value>` to paste a session token.
 */
export async function runLogin(args: string[]): Promise<void> {
  const tokenFlagIdx = args.indexOf("--token");
  if (tokenFlagIdx !== -1) {
    await loginWithToken(args[tokenFlagIdx + 1]);
    return;
  }

  // Complete directly from a sign-in link you already have, no new email needed.
  const linkFlagIdx = args.indexOf("--link");
  if (linkFlagIdx !== -1) {
    try {
      const session = await completeFromInput("", args[linkFlagIdx + 1] || "");
      await persistAndWire(session.refreshToken, session.userId, session.email);
    } catch (e) {
      out(`\n✗ ${(e as Error).message}\n`);
      process.exit(1);
    }
    return;
  }

  out(
    `\nConnect your Starbase account\n` +
      `-----------------------------\n` +
      `We'll email you a sign-in link. No password needed.\n\n`
  );

  const email = (await ask("Your Starbase email: ")).toLowerCase();
  if (!email || !email.includes("@")) {
    out("\n✗ That doesn't look like an email address.\n");
    process.exit(1);
  }

  let emailSent = true;
  try {
    await requestLoginEmail(email);
  } catch (e) {
    // Email throttled or failed: don't give up. The user may already have a
    // recent sign-in link they can paste.
    emailSent = false;
    out(`\n! ${(e as Error).message}\n`);
  }

  if (emailSent) {
    out(
      `\nWe emailed a sign-in link to ${email}. (Check spam if you don't see it.)\n` +
        `Open the email, copy the "Sign in" link, and paste it below.\n\n`
    );
  } else {
    out(
      `\nIf you already have a recent Starbase sign-in email, open it, copy the\n` +
        `"Sign in" link, and paste it below. Otherwise press Ctrl+C and try later.\n\n`
    );
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const pasted = await ask("Paste the sign-in link: ");
    try {
      const session = await completeFromInput(email, pasted);
      await persistAndWire(session.refreshToken, session.userId, session.email || email);
      return;
    } catch (e) {
      out(`✗ ${(e as Error).message}\n`);
      if (attempt === 3) process.exit(1);
    }
  }
}

/** Advanced fallback: validate and save a pasted session/refresh token. */
async function loginWithToken(raw?: string): Promise<void> {
  const value = raw ?? (await ask("Paste your Starbase token: "));
  let refreshToken: string;
  try {
    refreshToken = extractRefreshToken(value);
  } catch (e) {
    out(`\n✗ ${(e as Error).message}\n`);
    process.exit(1);
  }
  out("\nVerifying with Starbase...\n");
  const { supabaseUrl, anonKey } = authConfig();
  try {
    const tokens = new TokenManager({ supabaseUrl, anonKey, refreshToken });
    const { userId, email } = await tokens.ensureSession();
    await persistAndWire(refreshToken, userId, email);
  } catch (e) {
    out(`\n✗ ${(e as Error).message}\n`);
    process.exit(1);
  }
}
