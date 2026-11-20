# Galaxy

An open-source, local-first notes app where your notes are a galaxy.

- Your vault is a plain folder of Markdown files, compatible with Obsidian vaults.
- Notes are stars, related notes form constellations, and a black hole sits at the center.
- An optional AI companion (Claude, Jev, n8n) helps you work with your notes. Everything works without it.

**Status:** Phase 0, an empty desktop shell. Nothing to use yet.

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

## Stack

Electron, React, TypeScript, built with electron-vite.

## License

[MIT](LICENSE)
