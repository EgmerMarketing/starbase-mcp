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

> **On Windows, use Command Prompt, not PowerShell.** Press Start, type `cmd`,
> open **Command Prompt**, and paste the command there. (PowerShell blocks `npx`
> by default with a "scripts are disabled" error.)

Then:

1. Type your **Starbase email** and press Enter. We email you a sign-in link.
2. Open the email (from Starbase / Supabase). **Copy the "Sign In" link:**
   - On a computer: right-click the **Sign In** button and choose **Copy link**.
   - On a phone: press and hold the **Sign In** button, then tap **Copy link**.
3. **Paste the link** back into the terminal and press Enter.

No password, no developer tools. That signs you in.

If you use **Claude Desktop**, setup connects itself automatically. Just **fully
quit and reopen Claude Desktop** (not only close the window), then try asking:
*"List my Starbase contacts."*

If you use **Claude Code**, run one more command:

```bash
claude mcp add starbase -- npx -y github:EgmerMarketing/starbase-mcp
```

That's the whole setup. Your session refreshes itself from then on, so you should
never have to sign in again.

> **Heads up on the email:** Starbase's sign-in emails currently go through a
> shared sender that's rate-limited, so the email can be slow or, if a lot of
> people sign in at once, occasionally not arrive. If it doesn't show up in a few
> minutes (check spam first), wait a bit and run `login` again, or use the token
> method in Troubleshooting below.

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

- **No email in your inbox?** Check spam first. The shared sender is rate-limited,
  so it can be slow. Wait a few minutes and run `login` again, or use the token
  method below.
- **"That link didn't work"?** Sign-in links are single-use and expire quickly.
  Run `login` again to get a fresh one, and paste it soon after it arrives.
- **Windows: "running scripts is disabled on this system"?** That's PowerShell
  blocking `npx`. Use **Command Prompt** instead (Start ▸ type `cmd`), or in
  PowerShell run `npx.cmd -y github:EgmerMarketing/starbase-mcp login`.
- **"No Starbase refresh token found"** — run the `login` command above.
- **Need to reset?** Credentials live in `~/.starbase-mcp/` (created with `600`
  permissions). Delete that folder and run `login` again.

### Advanced: sign in with a token instead of email

If the email is being slow, you can sign in instantly with a session token:

```bash
npx -y github:EgmerMarketing/starbase-mcp login --token "<your sb-...-auth-token value>"
```

Get the value from your browser at starbaseos.com under DevTools ▸ Application ▸
Local Storage ▸ the key ending in `-auth-token`. You can paste the whole value.

---

## How it works

Starbase signs in with Google, so there's no API key to copy. The `login` command
uses Starbase's email sign-in link to create a **dedicated session for this MCP
server**, separate from your browser. It then exchanges that for short-lived
access tokens automatically and rotates them in the background, persisting state
to `~/.starbase-mcp/`. Your user id is read from the token itself, so every person
who installs this uses their own login and sees only their own data.

Built by [Egmer Marketing](https://egmermarketing.com). MIT licensed.
