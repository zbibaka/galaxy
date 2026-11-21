# Galaxy

An open-source, local-first notes app where your notes are a galaxy.

- Your vault is a plain folder of Markdown files, compatible with Obsidian vaults.
- Notes are stars, related notes form constellations, and a black hole sits at the center.
- An optional AI companion (Claude, Jev, n8n) helps you work with your notes. Everything works without it.

**Status:** Phase 2. You can open a vault folder, see it as a galaxy and take real notes:

- 3D galaxy view: notes are stars, top-level folders are constellations, a black hole sits in the middle. Click a star to open it; click the black hole for the dashboard
- Dashboard: note and link counts, notes by day last edited, notes per constellation, most connected notes, recent activity
- File tree with folders, and a Markdown editor that autosaves
- Search across note names and text
- `[[wikilinks]]`: Ctrl+click to follow one; a link to a missing note creates it
- Backlinks panel showing which notes link to the open one

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
