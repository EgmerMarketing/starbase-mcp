import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TokenManager } from "./token-manager.js";

export interface StarbaseConfig {
  supabaseUrl: string;
  anonKey: string;
  tokens: TokenManager;
  userId: string;
}

export class StarbaseClient {
  private supabase: SupabaseClient;
  private tokens: TokenManager;
  private userId: string;

  constructor(config: StarbaseConfig) {
    this.userId = config.userId;
    this.tokens = config.tokens;
    // supabase-js calls this before every request, so each query carries a fresh,
    // auto-refreshed access token without us rebuilding the client.
    this.supabase = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => this.tokens.getAccessToken(),
    });
  }

  /**
   * Runs a Supabase query builder, and if it comes back as an auth failure once,
   * forces a token refresh and retries a single time.
   */
  private async run<T>(build: () => PromiseLike<{ data: T; error: unknown }>): Promise<T> {
    let { data, error } = await build();
    if (error && isAuthError(error)) {
      this.tokens.invalidate();
      ({ data, error } = await build());
    }
    if (error) throw new Error(errMessage(error));
    return data;
  }

  // ── Contacts ──────────────────────────────────────────────

  async listContacts(options?: { limit?: number; offset?: number; search?: string }) {
    return this.run(() => {
      let query = this.supabase
        .from("contacts")
        .select("*")
        .eq("user_id", this.userId)
        .order("position", { ascending: true });

      if (options?.search) {
        query = query.or(
          `first_name.ilike.%${options.search}%,last_name.ilike.%${options.search}%,email.ilike.%${options.search}%,company.ilike.%${options.search}%`
        );
      }
      if (options?.limit) query = query.limit(options.limit);
      if (options?.offset)
        query = query.range(options.offset, options.offset + (options?.limit ?? 50) - 1);
      return query;
    });
  }

  async getContact(contactId: string) {
    return this.run(() =>
      this.supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .eq("user_id", this.userId)
        .single()
    );
  }

  async createContact(contact: Record<string, unknown>) {
    return this.run(() =>
      this.supabase
        .from("contacts")
        .insert({ ...contact, user_id: this.userId })
        .select()
        .single()
    );
  }

  async updateContact(contactId: string, updates: Record<string, unknown>) {
    return this.run(() =>
      this.supabase
        .from("contacts")
        .update(updates)
        .eq("id", contactId)
        .eq("user_id", this.userId)
        .select()
        .single()
    );
  }

  async deleteContact(contactId: string) {
    await this.run(() =>
      this.supabase.from("contacts").delete().eq("id", contactId).eq("user_id", this.userId)
    );
    return { success: true };
  }

  // ── Tags ──────────────────────────────────────────────────

  async listTags() {
    return this.run(() =>
      this.supabase
        .from("tags")
        .select("*")
        .eq("user_id", this.userId)
        .order("name", { ascending: true })
    );
  }

  async createTag(name: string, color?: string) {
    const tag: Record<string, unknown> = { name, user_id: this.userId };
    if (color) tag.color = color;
    return this.run(() => this.supabase.from("tags").insert(tag).select().single());
  }

  async deleteTag(tagId: string) {
    await this.run(() =>
      this.supabase.from("tags").delete().eq("id", tagId).eq("user_id", this.userId)
    );
    return { success: true };
  }

  // ── Contact Tags (junction) ───────────────────────────────

  async getContactTags(contactId: string) {
    return this.run(() =>
      this.supabase.from("contact_tags").select("*, tags(*)").eq("contact_id", contactId)
    );
  }

  async addTagToContact(contactId: string, tagId: string) {
    return this.run(() =>
      this.supabase
        .from("contact_tags")
        .insert({ contact_id: contactId, tag_id: tagId })
        .select()
        .single()
    );
  }

  async removeTagFromContact(contactId: string, tagId: string) {
    await this.run(() =>
      this.supabase
        .from("contact_tags")
        .delete()
        .eq("contact_id", contactId)
        .eq("tag_id", tagId)
    );
    return { success: true };
  }

  // ── Forms ─────────────────────────────────────────────────

  async listForms() {
    return this.run(() =>
      this.supabase
        .from("forms")
        .select("*")
        .eq("user_id", this.userId)
        .order("created_at", { ascending: false })
    );
  }

  async getForm(formId: string) {
    return this.run(() =>
      this.supabase.from("forms").select("*").eq("id", formId).eq("user_id", this.userId).single()
    );
  }

}

function isAuthError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; status?: number } | null;
  if (!e) return false;
  if (e.status === 401 || e.code === "401" || e.code === "PGRST301") return true;
  return typeof e.message === "string" && /jwt|token|expired|unauthor/i.test(e.message);
}

function errMessage(error: unknown): string {
  const e = error as { message?: string } | null;
  return e?.message ?? "Unknown Starbase API error";
}
