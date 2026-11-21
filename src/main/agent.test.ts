import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toEvents } from './agent.ts'

test('stream-json lines become agent panel events', () => {
  const said = { type: 'assistant', message: { content: [{ type: 'text', text: ' Done. ' }, { type: 'tool_use', name: 'mcp__vault__write_note', input: { path: 'Todo.md' } }] } }
  assert.deepEqual(toEvents(said), [
    { kind: 'text', text: 'Done.' },
    { kind: 'tool', text: 'write note Todo.md' }
  ])
  assert.deepEqual(toEvents({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'vault', status: 'failed' }] }), [
    { kind: 'error', text: 'The vault tools did not start (failed)' }
  ])
  assert.deepEqual(toEvents({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'vault', status: 'connected' }] }), [])
  assert.deepEqual(toEvents({ type: 'result', is_error: true, subtype: 'error_max_turns' }), [{ kind: 'error', text: 'error_max_turns' }])
  assert.deepEqual(toEvents({ type: 'result', is_error: false, result: 'Done.' }), [])
})
