import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type Fetch, writeRisk } from './jev.ts'
import { resolveNote } from './vault.ts'

/** What Claude Code expects back from a --permission-prompt-tool. */
export type Decision = { behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string }

/**
 * Why a write_note call should wait for the user, or null to let it run.
 * New notes always run. Without Jev, replacing a note runs too (as before Phase 4; undo covers it).
 * With Jev, a risky replacement asks, and so does any failure to check: the guardrail fails closed.
 */
export async function writeConcern(root: string, prompt: string, input: Record<string, unknown>, key: string | null, f?: Fetch): Promise<string | null> {
  const path = input['path']
  const after = input['content']
  let before: string
  try {
    before = await readFile(resolveNote(root, path), 'utf8')
  } catch {
    return null // a new note, or a bad path that write_note itself refuses
  }
  if (!key || typeof after !== 'string' || after === before) return null
  try {
    return await writeRisk(key, { prompt, path: String(path), before, after }, f)
  } catch (error) {
    return `it could not be checked (${(error as Error).message})`
  }
}

/**
 * A one-run HTTP server on 127.0.0.1 that the vault MCP server's `approve` tool calls for each write.
 * The random token means only the MCP server started for this run can ask; `env` passes both to it.
 */
export async function approvalServer(decide: (tool: string, input: Record<string, unknown>) => Promise<Decision>) {
  const token = randomBytes(24).toString('hex')
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403).end()
      return
    }
    let body = ''
    req.on('data', (d) => {
      body += d
      if (body.length > 5_000_000) req.destroy()
    })
    req.on('end', async () => {
      let out: Decision
      try {
        const { tool_name, input } = JSON.parse(body) as { tool_name?: unknown; input?: Record<string, unknown> }
        out = await decide(String(tool_name), input ?? {})
      } catch (error) {
        out = { behavior: 'deny', message: (error as Error).message }
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  return {
    env: { GALAXY_APPROVE_URL: `http://127.0.0.1:${port}/`, GALAXY_APPROVE_TOKEN: token },
    close: (): void => {
      server.closeAllConnections()
      server.close()
    }
  }
}
