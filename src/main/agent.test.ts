import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toEvents } from './agent.ts'

test('stream-json lines become agent panel events', () => {
  const said = { type: 'assistant', message: { content: [{ type: 'text', text: ' Done. ' }, { type: 'tool_use', name: 'mcp__vault__write_note', input: { path: 'Todo.md' } }] } }
  assert.deepEqual(toEvents(said), [
    { kind: 'text', text: 'Done.' },
    { kind: 'tool', text: 'write note Todo.md' }
  ])
  assert.deepEqual(toEvents({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__n8n__create_workflow_from_code', input: {} }] } }), [
    { kind: 'tool', text: 'n8n: create workflow from code' }
  ])
  assert.deepEqual(toEvents({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'vault', status: 'failed' }] }), [
    { kind: 'error', text: 'The vault tools did not start (failed)' }
  ])
  assert.deepEqual(toEvents({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'vault', status: 'connected' }] }), [])
  assert.deepEqual(toEvents({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'vault', status: 'connected' }, { name: 'n8n', status: 'failed' }] }), [
    { kind: 'tool', text: 'Could not reach n8n (failed); check its MCP URL and token' }
  ])
  assert.deepEqual(toEvents({ type: 'result', is_error: true, subtype: 'error_max_turns' }), [{ kind: 'error', text: 'error_max_turns' }])
  assert.deepEqual(toEvents({ type: 'result', is_error: false, result: 'Done.' }), [])
})
