# Starbase MCP

Connect your [Starbase OS](https://starbaseos.com) CRM to Claude. Once connected,
you can ask Claude to look up contacts, tag leads, and read your forms, straight
from your own Starbase account.

Works in **Claude Desktop**, **Claude Code**, and any other MCP client.

---

## Quick start

Run this in your terminal:

```bash
npx -y github:EgmerMarketing/starbase-mcp login
```

It asks for your **Starbase email**, emails you a **6-digit code**, and you type
the code back. No password, no developer tools, no copy/pasting tokens.

If you use **Claude Desktop**, that's it: setup connects itself automatically.
Just **fully quit and reopen Claude Desktop** (not only close the window), and
try asking: *"List my Starbase contacts."*

If you use **Claude Code**, run one more command:

```bash
claude mcp add starbase -- npx -y github:EgmerMarketing/starbase-mcp
```

That's the whole setup. Your session refreshes itself from then on, so you should
never have to sign in again.

---

## Tools

| Area | Tools |
| --- | --- |
| Contacts | `list_contacts`, `get_contact`, `create_contact`, `update_contact`, `delete_contact` |
| Tags | `list_tags`, `create_tag`, `delete_tag`, `get_contact_tags`, `add_tag_to_contact`, `remove_tag_from_contact` |
| Forms | `list_forms`, `get_form` |

All tools are prefixed `starbase_` and operate **only on your own account**. The
server scopes every request to your user id and Starbase's row-level security
enforces it server-side.

---

## Troubleshooting

Check your setup any time:

```bash
npx github:EgmerMarketing/starbase-mcp doctor
```

- **No code in your inbox?** Check spam. Codes expire quickly, so request a fresh
  one if a few minutes have passed.
- **"No Starbase refresh token found"** — run the `login` command above.
- **Need to reset?** Credentials live in `~/.starbase-mcp/` (created with `600`
  permissions). Delete that folder and run `login` again.

### Advanced: sign in with a token instead of a code

If you'd rather not use the email code, you can paste a session token:

```bash
npx -y github:EgmerMarketing/starbase-mcp login --token "<your sb-...-auth-token value>"
```

Get the value from your browser at starbaseos.com under DevTools ▸ Application ▸
Local Storage ▸ the key ending in `-auth-token`. You can paste the whole value.

---

## How it works

Starbase signs in with Google, so there's no API key to copy. The `login` command
uses Starbase's email one-time-code to create a **dedicated session for this MCP
server**, separate from your browser. It then exchanges that for short-lived
access tokens automatically and rotates them in the background, persisting state
to `~/.starbase-mcp/`. Your user id is read from the token itself, so every person
who installs this uses their own login and sees only their own data.

Built by [Egmer Marketing](https://egmermarketing.com). MIT licensed.
