#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveConfig } from "./config.js";
import { runLogin } from "./login.js";
import { StarbaseClient } from "./starbase-client.js";
import { TokenManager } from "./token-manager.js";

const VERSION = "2.0.0";

// ============================================================
// CLI: login / doctor / serve
// ============================================================

/** Diagnose the current configuration without starting the server. */
async function runDoctor(): Promise<void> {
  try {
    const cfg = resolveConfig();
    process.stderr.write(`Supabase URL: ${cfg.supabaseUrl}\nVerifying token...\n`);
    const tokens = new TokenManager(cfg);
    const { userId, email } = await tokens.ensureSession();
    process.stderr.write(`✓ Healthy. Signed in${email ? ` as ${email}` : ""} (user ${userId}).\n`);
  } catch (e) {
    process.stderr.write(`✗ ${(e as Error).message}\n`);
    process.exit(1);
  }
}

// ============================================================
// MCP SERVER
// ============================================================

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

async function runServer(): Promise<void> {
  const cfg = resolveConfig();
  const tokens = new TokenManager(cfg);

  // Validate the token up front so misconfiguration fails loudly at launch
  // instead of on the first tool call.
  const { userId, email } = await tokens.ensureSession();
  console.error(`Starbase MCP: authenticated${email ? ` as ${email}` : ""} (${userId})`);

  const client = new StarbaseClient({
    supabaseUrl: cfg.supabaseUrl,
    anonKey: cfg.anonKey,
    tokens,
    userId,
  });

  const server = new McpServer({ name: "starbase-mcp", version: VERSION });

  // Small wrapper: registers a tool whose handler returns plain data, and
  // standardizes JSON formatting + error reporting.
  type Shape = Record<string, z.ZodTypeAny>;
  function tool<S extends Shape>(
    name: string,
    description: string,
    schema: S,
    handler: (args: { [K in keyof S]: z.infer<S[K]> }) => Promise<unknown>
  ) {
    const cb = async (args: any) => {
      try {
        const data = await handler(args);
        return { content: [{ type: "text" as const, text: formatResult(data) }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    };
    // The SDK's overloads don't play well with a generic wrapper; the runtime
    // shape is correct, so register through a cast.
    (server.tool as any)(name, description, schema, cb);
  }

  // ── Contacts ──
  tool(
    "starbase_list_contacts",
    "List contacts in your Starbase CRM. Supports search and pagination.",
    {
      search: z.string().optional().describe("Search by name, email, or company"),
      limit: z.number().optional().describe("Max results to return (default 50)"),
      offset: z.number().optional().describe("Offset for pagination"),
    },
    ({ search, limit, offset }) => client.listContacts({ search, limit, offset })
  );

  tool(
    "starbase_get_contact",
    "Get a single contact by ID.",
    { contact_id: z.string().describe("The contact UUID") },
    ({ contact_id }) => client.getContact(contact_id)
  );

  const contactFields = {
    first_name: z.string().optional().describe("First name"),
    last_name: z.string().optional().describe("Last name"),
    email: z.string().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
    company: z.string().optional().describe("Company name"),
    title: z.string().optional().describe("Job title"),
    notes: z.string().optional().describe("Notes about the contact"),
    website: z.string().optional().describe("Website URL"),
    linkedin: z.string().optional().describe("LinkedIn profile URL"),
    status: z.string().optional().describe("Contact status"),
  };

  tool(
    "starbase_create_contact",
    "Create a new contact in your Starbase CRM.",
    contactFields,
    (params) => client.createContact(pruneUndefined(params))
  );

  tool(
    "starbase_update_contact",
    "Update an existing contact.",
    { contact_id: z.string().describe("The contact UUID to update"), ...contactFields },
    ({ contact_id, ...updates }) => client.updateContact(contact_id, pruneUndefined(updates))
  );

  tool(
    "starbase_delete_contact",
    "Delete a contact by ID.",
    { contact_id: z.string().describe("The contact UUID to delete") },
    ({ contact_id }) => client.deleteContact(contact_id)
  );

  // ── Tags ──
  tool("starbase_list_tags", "List all tags.", {}, () => client.listTags());

  tool(
    "starbase_create_tag",
    "Create a new tag.",
    {
      name: z.string().describe("Tag name"),
      color: z.string().optional().describe("Tag color (hex code)"),
    },
    ({ name, color }) => client.createTag(name, color)
  );

  tool(
    "starbase_delete_tag",
    "Delete a tag.",
    { tag_id: z.string().describe("The tag UUID to delete") },
    ({ tag_id }) => client.deleteTag(tag_id)
  );

  tool(
    "starbase_get_contact_tags",
    "Get all tags assigned to a specific contact.",
    { contact_id: z.string().describe("The contact UUID") },
    ({ contact_id }) => client.getContactTags(contact_id)
  );

  tool(
    "starbase_add_tag_to_contact",
    "Add a tag to a contact.",
    {
      contact_id: z.string().describe("The contact UUID"),
      tag_id: z.string().describe("The tag UUID to add"),
    },
    ({ contact_id, tag_id }) => client.addTagToContact(contact_id, tag_id)
  );

  tool(
    "starbase_remove_tag_from_contact",
    "Remove a tag from a contact.",
    {
      contact_id: z.string().describe("The contact UUID"),
      tag_id: z.string().describe("The tag UUID to remove"),
    },
    ({ contact_id, tag_id }) => client.removeTagFromContact(contact_id, tag_id)
  );

  // ── Forms ──
  tool("starbase_list_forms", "List your Starbase lead-capture forms.", {}, () =>
    client.listForms()
  );

  tool(
    "starbase_get_form",
    "Get a single form (fields + settings) by ID.",
    { form_id: z.string().describe("The form UUID") },
    ({ form_id }) => client.getForm(form_id)
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Starbase MCP server running on stdio");
}

function pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// ============================================================
// ENTRY
// ============================================================

async function main() {
  const cmd = process.argv[2];
  switch (cmd) {
    case "login":
    case "setup":
      await runLogin(process.argv.slice(3));
      break;
    case "doctor":
      await runDoctor();
      break;
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      break;
    default:
      await runServer();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error?.message ?? error);
  process.exit(1);
});
