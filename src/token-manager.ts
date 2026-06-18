import fs from "fs";
import { SESSION_FILE, STATE_DIR } from "./config.js";

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id?: string; email?: string };
}

interface PersistedSession {
  /** The original (seed) refresh token this session was started from. */
  seed: string;
  /** The most recent rotated refresh token. */
  refreshToken: string;
  userId: string;
  email?: string;
}

interface JwtClaims {
  sub?: string;
  exp?: number;
  email?: string;
}

function decodeJwt(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    const payload = Buffer.from(parts[1], "base64").toString("utf8");
    return JSON.parse(payload) as JwtClaims;
  } catch {
    return {};
  }
}

function loadPersisted(): PersistedSession | null {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) as PersistedSession;
  } catch {
    return null;
  }
}

function savePersisted(session: PersistedSession): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
  } catch {
    /* persistence is best-effort; the server still works without it */
  }
}

/**
 * Turns a long-lived Supabase refresh token into short-lived access tokens,
 * refreshing automatically before each expiry and again on any 401. Supabase
 * rotates the refresh token on every exchange, so we persist the rotated value
 * to disk (keyed by the seed token) and prefer it on restart. This is what makes
 * the server "set it once and forget it" instead of the old hourly re-paste.
 */
export class TokenManager {
  private readonly supabaseUrl: string;
  private readonly anonKey: string;
  private readonly seed: string;
  private refreshToken: string;
  private accessToken: string | null = null;
  private accessTokenExp = 0; // epoch seconds
  private userId: string | null = null;
  private email: string | undefined;
  private inflight: Promise<string> | null = null;

  constructor(opts: { supabaseUrl: string; anonKey: string; refreshToken: string }) {
    this.supabaseUrl = opts.supabaseUrl.replace(/\/+$/, "");
    this.anonKey = opts.anonKey;
    this.seed = opts.refreshToken;

    // If we have a persisted session started from the same seed, resume it so a
    // restart keeps working even though Supabase rotated the original token away.
    const persisted = loadPersisted();
    if (persisted && persisted.seed === this.seed) {
      this.refreshToken = persisted.refreshToken;
      this.userId = persisted.userId;
      this.email = persisted.email;
    } else {
      this.refreshToken = this.seed;
    }
  }

  /** Ensure we have a valid session and return identity info. */
  async ensureSession(): Promise<{ userId: string; email?: string }> {
    await this.getAccessToken();
    return { userId: this.userId as string, email: this.email };
  }

  /** Returns a valid access token, refreshing if missing/expiring within 60s. */
  async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && now < this.accessTokenExp - 60) {
      return this.accessToken;
    }
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  /** Force a refresh on next call (used after a 401). */
  invalidate(): void {
    this.accessToken = null;
    this.accessTokenExp = 0;
  }

  private async refresh(): Promise<string> {
    const res = await fetch(
      `${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Starbase sign-in failed (HTTP ${res.status}). Your refresh token is invalid or expired. ` +
          `Re-run \`npx github:EgmerMarketing/starbase-mcp login\` to paste a fresh one.` +
          (body ? `\nDetails: ${body}` : "")
      );
    }

    const data = (await res.json()) as RefreshResponse;
    const claims = decodeJwt(data.access_token);

    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token || this.refreshToken;
    this.userId = data.user?.id ?? claims.sub ?? this.userId;
    this.email = data.user?.email ?? claims.email ?? this.email;
    this.accessTokenExp =
      claims.exp ?? data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600);

    if (!this.userId) {
      throw new Error("Signed in but could not determine your Starbase user id from the token.");
    }

    savePersisted({
      seed: this.seed,
      refreshToken: this.refreshToken,
      userId: this.userId,
      email: this.email,
    });

    return this.accessToken;
  }
}
