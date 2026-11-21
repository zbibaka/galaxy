import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { startVaultHttp } from './vaultHttp.ts'

test('vault HTTP server needs the token, writes notes and reports writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galaxy-http-'))
  let writes = 0
  const close = await startVaultHttp({ root: () => root, token: 't0k', port: 47291, onWrite: () => writes++ })
  const post = (body: object, token = 't0k') =>
    fetch('http://127.0.0.1:47291/', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  try {
    assert.equal((await post({}, 'nope')).status, 401)
    const call = (name: string, args: object) => post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    assert.equal((await (await call('write_note', { path: 'From n8n.md', content: 'hi' })).json()).result.content[0].text, 'Saved From n8n.md')
    assert.equal(await readFile(join(root, 'From n8n.md'), 'utf8'), 'hi')
    assert.equal(writes, 1)
    assert.equal((await call('approve', { tool_name: 'x', input: {} })).status, 202)
    assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202)
  } finally {
    close()
  }
})
