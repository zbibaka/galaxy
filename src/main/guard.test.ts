import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { approvalServer, writeConcern } from './guard.ts'
import type { Fetch } from './jev.ts'

const jevSays = (loses: number) =>
  (async () => new Response(JSON.stringify({ answers: { loses: { noul: loses }, injected: { noul: 0 } } }))) as unknown as Fetch
const jevDown = (async () => {
  throw new Error('offline')
}) as unknown as Fetch

test('writeConcern lets new notes through and asks about risky or unchecked replacements', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galaxy-guard-'))
  await writeFile(join(root, 'A.md'), 'old text')
  const write = (path: string, content: string) => ({ path, content })

  assert.equal(await writeConcern(root, 'p', write('New.md', 'x'), 'key', jevDown), null)
  assert.equal(await writeConcern(root, 'p', write('A.md', 'changed'), null), null)
  assert.equal(await writeConcern(root, 'p', write('A.md', 'old text'), 'key', jevDown), null)
  assert.equal(await writeConcern(root, 'p', write('A.md', 'changed'), 'key', jevSays(0.1)), null)
  assert.match((await writeConcern(root, 'p', write('A.md', 'changed'), 'key', jevSays(0.9)))!, /remove/)
  assert.match((await writeConcern(root, 'p', write('A.md', 'changed'), 'key', jevDown))!, /could not be checked/)
})

test('approval server needs the token and returns the decision', async () => {
  const server = await approvalServer(async (tool, input) =>
    tool === 'mcp__vault__write_note' ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'no' }
  )
  try {
    const post = (token: string, body: object) =>
      fetch(server.env.GALAXY_APPROVE_URL, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    assert.equal((await post('wrong', {})).status, 403)
    assert.deepEqual(await (await post(server.env.GALAXY_APPROVE_TOKEN, { tool_name: 'mcp__vault__write_note', input: { path: 'A.md' } })).json(), {
      behavior: 'allow',
      updatedInput: { path: 'A.md' }
    })
    assert.equal((await (await post(server.env.GALAXY_APPROVE_TOKEN, { tool_name: 'Bash', input: {} })).json()).behavior, 'deny')
  } finally {
    server.close()
  }
})
