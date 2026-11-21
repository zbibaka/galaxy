import type { Note } from './types'

// [[Target]], [[Target#Heading]], [[Target|alias]], [[Target#Heading|alias]]
const LINK = /\[\[([^[\]|#\n]+)(?:#[^[\]|\n]*)?(?:\|[^[\]\n]*)?\]\]/g

/** File name without folder or .md: "ideas/Space.md" -> "Space". */
export const noteName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '')

/** Link targets in a text: "[[Ideas#Top|my ideas]]" -> ["Ideas"]. */
export function parseLinks(text: string): string[] {
  return [...text.matchAll(LINK)].map((m) => m[1]!.trim())
}

/** The link target at a character offset in a line, if the offset sits inside a [[link]]. */
export function linkAt(line: string, offset: number): string | null {
  for (const m of line.matchAll(LINK)) {
    if (offset >= m.index && offset <= m.index + m[0].length) return m[1]!.trim()
  }
  return null
}

// Like Obsidian: a link matches a note by its name, or by its path without .md. Case-insensitive.
// shortcut: two notes with the same name in different folders both match; pick one like Obsidian when it matters.
function matches(target: string, path: string): boolean {
  const t = target.toLowerCase().replace(/\.md$/, '')
  return t === noteName(path).toLowerCase() || t === path.toLowerCase().replace(/\.md$/, '')
}

export const resolveLink = (paths: string[], target: string): string | undefined => paths.find((p) => matches(target, p))

export type Hit = { path: string; line: string }

/** Notes that link to `path`, each with the first line holding the link. */
export function backlinks(notes: Note[], path: string): Hit[] {
  const hits: Hit[] = []
  for (const note of notes) {
    if (note.path === path) continue
    const line = note.content.split('\n').find((l) => parseLinks(l).some((t) => matches(t, path)))
    if (line !== undefined) hits.push({ path: note.path, line: line.trim() })
  }
  return hits
}

/** Notes whose name or text contains the query (case-insensitive), with the first matching line. */
export function search(notes: Note[], query: string): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: Hit[] = []
  for (const note of notes) {
    const line = note.content.split('\n').find((l) => l.toLowerCase().includes(q))
    if (line !== undefined || noteName(note.path).toLowerCase().includes(q)) {
      hits.push({ path: note.path, line: (line ?? '').trim() })
    }
  }
  return hits
}

/** A folder has children; a note does not. */
export type TreeNode = { name: string; path: string; children?: TreeNode[] }

/** Folders first, then notes, each sorted by name. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const p of paths) {
    const parts = p.split('/')
    let level = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let node = level.find((n) => n.path === path)
      if (!node) {
        node = i === parts.length - 1 ? { name: noteName(path), path } : { name: part, path, children: [] }
        level.push(node)
      }
      level = node.children ?? []
    })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => Number(!a.children) - Number(!b.children) || a.name.localeCompare(b.name))
    for (const n of nodes) if (n.children) sort(n.children)
    return nodes
  }
  return sort(root)
}
