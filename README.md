# Starbase MCP

Connect your [Starbase OS](https://starbaseos.com) CRM to Claude. Once installed,
you can ask Claude to look up contacts, tag leads, read your forms, check
analytics, and more — straight from your own Starbase account.

Works in **Claude Desktop**, **Claude Code**, and any other MCP client.

---

## Quick start (2 minutes)

### 1. Get your Starbase token

1. Sign in at **[starbaseos.com](https://starbaseos.com)**.
2. Open your browser DevTools (`Cmd+Opt+I` on Mac, `F12` on Windows).
3. Go to **Application** ▸ **Local Storage** ▸ `https://starbaseos.com`.
4. Find the key that **starts with `sb-`** and **ends with `-auth-token`**.
5. Copy its **entire value** (you can paste the whole thing — the setup grabs
   what it needs).

### 2. Save it

Run this once in your terminal:

```bash
npx github:EgmerMarketing/starbase-mcp login
```

Paste your token when prompted. You should see:

```
✓ Signed in as you@email.com (user xxxx). Saved to ~/.starbase-mcp/config.json
```

That's it — the server refreshes your session automatically from now on. You
should never have to paste a token again.

### 3. Add it to Claude

**Claude Desktop** — edit your config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "starbase": {
      "command": "npx",
      "args": ["-y", "github:EgmerMarketing/starbase-mcp"]
    }
  }
}
```

**Claude Code** — one command:

```bash
claude mcp add starbase -- npx -y github:EgmerMarketing/starbase-mcp
```

Restart Claude and you're done. Try asking: *"List my Starbase contacts."*

---

## Don't want to save a config file?

Skip `login` and pass the token inline instead. Put the **whole `sb-…-auth-token`
value** as `STARBASE_REFRESH_TOKEN`:

```json
{
  "mcpServers": {
    "starbase": {
      "command": "npx",
      "args": ["-y", "github:EgmerMarketing/starbase-mcp"],
      "env": {
        "STARBASE_REFRESH_TOKEN": "paste-your-token-value-here"
      }
    }
  }
}
```

---

## Tools

| Area | Tools |
| --- | --- |
| Contacts | `list_contacts`, `get_contact`, `create_contact`, `update_contact`, `delete_contact` |
| Tags | `list_tags`, `create_tag`, `delete_tag`, `get_contact_tags`, `add_tag_to_contact`, `remove_tag_from_contact` |
| Forms | `list_forms`, `get_form` |

All tools are prefixed `starbase_` and operate **only on your own account** —
the server scopes every request to your user id and Starbase's row-level security
enforces it server-side.

---

## Troubleshooting

Check your setup any time:

```bash
npx github:EgmerMarketing/starbase-mcp doctor
```

- **"No Starbase refresh token found"** — run `npx github:EgmerMarketing/starbase-mcp login`.
- **"Your refresh token is invalid or expired"** — your Starbase session was
  signed out everywhere. Grab a fresh token (step 1) and run `login` again.
- Tokens and session state live in `~/.starbase-mcp/` (created with `600`
  permissions). Delete that folder to fully reset.

---

## How auth works

Starbase signs in with Google OAuth, so there's no API key to copy. Instead this
server uses your **refresh token** — the same long-lived credential your browser
uses to stay signed in. It exchanges that for a short-lived access token before
each request and rotates it automatically, persisting the rotated token to
`~/.starbase-mcp/session.json`. Your user id is read from the token itself, so
the server is fully multi-user: every person uses their own token and sees only
their own data.

Built by [Egmer Marketing](https://egmermarketing.com). MIT licensed.
