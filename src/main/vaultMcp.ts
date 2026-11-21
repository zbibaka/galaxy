import { readFile } from 'node:fs/promises'
import { backlinks, search } from '../shared/links.ts'
import { listNotes, resolveNote, writeNote } from './vault.ts'

const path = { type: 'string', description: 'Note path relative to the vault, with "/" separators, ending in .md' }
const TOOLS = [
  { name: 'list_notes', description: 'Lists every note path in the vault.', inputSchema: { type: 'object', properties: {} } },
  { name: 'read_note', description: 'Returns the Markdown text of one note.', inputSchema: { type: 'object', properties: { path }, required: ['path'] } },
  {
    name: 'search_notes',
    description: 'Finds notes whose name or text contains the query (case-insensitive). Returns each path with its first matching line.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  {
    name: 'backlinks',
    description: 'Lists notes that [[link]] to the given note.',
    inputSchema: { type: 'object', properties: { path }, required: ['path'] }
  },
  {
    name: 'write_note',
    description: 'Creates a note or replaces its whole text. Use [[Note name]] to link notes. Folders are created as needed.',
    inputSchema: { type: 'object', properties: { path, content: { type: 'string' } }, required: ['path', 'content'] }
  }
]

type Args = Record<string, unknown>

async function callTool(root: string, name: string, args: Args): Promise<string> {
  switch (name) {
    case 'list_notes':
      return (await listNotes(root)).map((n) => n.path).join('\n') || '(the vault has no notes)'
    case 'read_note':
      return readFile(resolveNote(root, args['path']), 'utf8')
    case 'search_notes':
      return JSON.stringify(search(await listNotes(root), String(args['query'] ?? '')))
    case 'backlinks':
      return JSON.stringify(backlinks(await listNotes(root), String(args['path'])))
    case 'write_note':
      await writeNote(root, args['path'], args['content'])
      return `Saved ${String(args['path'])}`
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

type Message = { id?: number | string; method?: string; params?: { protocolVersion?: string; name?: string; arguments?: Args } }

/** Answers one MCP JSON-RPC message for the vault at `root`; returns null for notifications. */
export async function handle(root: string, msg: Message): Promise<object | null> {
  if (msg.id === undefined) return null
  const reply = (result: object): object => ({ jsonrpc: '2.0', id: msg.id, result })
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'galaxy-vault', version: '0.0.1' },
        instructions: 'Tools for reading and writing the Markdown notes in a Galaxy vault.'
      })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: TOOLS })
    case 'tools/call':
      try {
        const text = await callTool(root, String(msg.params?.name), msg.params?.arguments ?? {})
        return reply({ content: [{ type: 'text', text }] })
      } catch (error) {
        return reply({ content: [{ type: 'text', text: (error as Error).message }], isError: true })
      }
    default:
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } }
  }
}
