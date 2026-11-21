import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { handle } from './vaultMcp.ts'

const call = (root: string, name: string, args: object) =>
  handle(root, { id: 1, method: 'tools/call', params: { name, arguments: args as Record<string, unknown> } }) as Promise<{
    result: { content: { text: string }[]; isError?: boolean }
  }>

test('vault MCP tools read, write, search and stay inside the vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galaxy-mcp-'))
  await writeFile(join(root, 'Space.md'), 'Stars and [[Moon]]')

  const list = (await handle(root, { id: 1, method: 'tools/list' })) as { result: { tools: { name: string }[] } }
  assert.deepEqual(list.result.tools.map((t) => t.name), ['list_notes', 'read_note', 'search_notes', 'backlinks', 'write_note'])

  assert.equal((await call(root, 'write_note', { path: 'Moon.md', content: 'Rocky' })).result.content[0]!.text, 'Saved Moon.md')
  assert.equal(await readFile(join(root, 'Moon.md'), 'utf8'), 'Rocky')
  assert.equal((await call(root, 'read_note', { path: 'Space.md' })).result.content[0]!.text, 'Stars and [[Moon]]')
  assert.match((await call(root, 'backlinks', { path: 'Moon.md' })).result.content[0]!.text, /Space\.md/)
  assert.match((await call(root, 'search_notes', { query: 'rocky' })).result.content[0]!.text, /Moon\.md/)

  const escape = await call(root, 'write_note', { path: '../outside.md', content: 'x' })
  assert.equal(escape.result.isError, true)
  assert.match(escape.result.content[0]!.text, /outside the vault/)
  assert.equal(await handle(root, { method: 'notifications/initialized' }), null)
})
