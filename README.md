# Galaxy

An open-source, local-first notes app where your notes are a galaxy.

- Your vault is a plain folder of Markdown files, compatible with Obsidian vaults.
- Notes are stars, related notes form constellations, and a black hole sits at the center.
- An optional AI companion (Claude, Jev, n8n) helps you work with your notes. Everything works without it.

**Status:** Phase 4. You can open a vault folder, see it as a galaxy, take real notes and have Claude work on them, with Jev keeping it fast and safe:

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

### Using the agent

The agent uses [Claude Code](https://claude.com/claude-code) with your own Claude account; Galaxy never sees your login. Install it, run `claude` once in a terminal to sign in, then open the Agent panel from the bar at the bottom. Undo needs [Git](https://git-scm.com). Snapshots are kept in the app's data folder, never inside your vault.

To turn on Jev, open **Jev (optional)** at the bottom of the Agent panel and paste a key from [typesafe.ai](https://typesafe.ai). The key is encrypted by your operating system and only used by the app itself. Without a key, everything works as before.

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
