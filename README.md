# Galaxy

An open-source, local-first notes app where your notes are a galaxy.

- Your vault is a plain folder of Markdown files, compatible with Obsidian vaults.
- Notes are stars, related notes form constellations, and a black hole sits at the center.
- An optional AI companion (Claude, Jev, n8n) helps you work with your notes. Everything works without it.

**Status:** Phase 6. You can open a vault folder, see it as a galaxy, take real notes, have Claude work on them with Jev keeping it fast and safe, automate routines with n8n, and talk to a floating companion that guides you around your screen:

- 3D galaxy view: notes are stars, top-level folders are constellations, a black hole sits in the middle. Click a star to open it; click the black hole for the dashboard
- Dashboard: note and link counts, notes by day last edited, notes per constellation, most connected notes, recent activity
- File tree with folders, and a Markdown editor that autosaves
- Search across note names and text
- `[[wikilinks]]`: Ctrl+click to follow one; a link to a missing note creates it
- Backlinks panel showing which notes link to the open one
- Agent panel (optional): ask Claude to work on your notes. It runs only when you press Run and can only list, read, search and write notes in the open vault, through Galaxy's own vault MCP server, with nothing else on your PC. Every run is snapshotted with git so **Undo last change** puts the notes back, and every run is logged to `agent-log.jsonl` in the app's data folder
- Jev (optional, needs a TypeSafe API key):
  - **Router:** sends small, clear jobs to Claude's fast model and everything else to your default model
  - **Guardrail:** new notes are always written, but a change to an existing note that looks risky (it drops content you didn't ask to drop, or follows instructions written inside a note) waits for your **Allow** or **Deny**. If Jev can't check a change, it asks you rather than guessing
  - **Auto-filing:** **File loose notes** suggests which constellation each loose note belongs in; you pick which to move, and **Undo last change** works for moves too
- n8n (optional, your own copy):
  - **Claude builds workflows** in your n8n through n8n's MCP server. It can read your instance and create new workflows, which stay unpublished until you review them. Publishing, running, test runs, editing existing workflows and archiving are refused
  - **Routines:** Galaxy spots dated notes you make every day or on the same weekday (like "Meeting 2026-11-16" every Monday) and offers to automate them. Starter automations: a daily note, a weekly review, and an inbox webhook
  - **Share the vault with n8n:** an optional local endpoint (`http://127.0.0.1:47231/`, needs a token) gives n8n's MCP Client node the same vault tools. Notes n8n writes show up in the app right away
- Companion:
  - **Talk:** press **Talk** in the Agent panel, or **Ctrl+Shift+Space** from anywhere, and say what you want. What you said fills the request box; you still press Run
  - **Voice note:** records and saves what you said as a new note (undo works)
  - Speech is turned into text on your computer with Whisper; the model (about 80 MB) downloads once on first use. A red indicator, also floating over other apps, shows whenever the microphone is on
  - **Guide me:** type what you want to do and Galaxy steps aside. The companion looks at your screen and puts a ring on the next thing to click, with one short instruction; press **Next** after each step. It never clicks or types for you, screenshots are never saved, and it refuses to look while a password manager or banking window is open. Each step sends one screenshot to Claude

### Using the agent

The agent uses [Claude Code](https://claude.com/claude-code) with your own Claude account; Galaxy never sees your login. Install it, run `claude` once in a terminal to sign in, then open the Agent panel from the bar at the bottom. Undo needs [Git](https://git-scm.com). Snapshots are kept in the app's data folder, never inside your vault.

To turn on Jev, open **Jev (optional)** at the bottom of the Agent panel and paste a key from [typesafe.ai](https://typesafe.ai). The key is encrypted by your operating system and only used by the app itself. Without a key, everything works as before.

To connect n8n (2.13 or newer; Galaxy does not include it), open **Instance-level MCP** in n8n's settings, turn on MCP access, and paste the server URL and an access token under **n8n (optional)** in the Agent panel. To let workflows read and write notes, tick **Let n8n read and write this vault** and add a Bearer Auth credential named "Galaxy vault" in n8n with the token shown. If n8n runs in Docker, it reaches the vault at `host.docker.internal` instead of `127.0.0.1`. n8n Cloud can build workflows but cannot reach a vault on your computer.

## Run it

Needs Node.js 20 or newer.

```sh
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the app with hot reload |
| `npm run build` | Builds into `out/` |
| `npm start` | Runs the built app |
| `npm run typecheck` | Checks TypeScript types |
| `npm test` | Runs the unit tests |

## Stack

Electron, React, TypeScript, CodeMirror 6 and three.js (via 3d-force-graph), built with electron-vite.

## License

[MIT](LICENSE)
