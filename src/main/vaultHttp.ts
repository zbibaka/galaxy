import { createServer } from 'node:http'
import { handle } from './vaultMcp.ts'

export const VAULT_HTTP_PORT = 47231

/**
 * The vault MCP tools over Streamable HTTP, so n8n's MCP Client node can read and write notes.
 * Only on 127.0.0.1, only with the bearer token, and only while the user has it switched on.
 * Answers each POST with plain JSON, which the MCP spec allows; there is no event stream.
 */
export async function startVaultHttp(opts: { root: () => string | null; token: string; port?: number; onWrite: () => void }) {
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${opts.token}`) {
      res.writeHead(401).end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end()
      return
    }
    let body = ''
    req.on('data', (d) => {
      body += d
      if (body.length > 5_000_000) req.destroy()
    })
    req.on('end', async () => {
      const root = opts.root()
      let msg: { method?: string; params?: { name?: string } }
      try {
        msg = JSON.parse(body)
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }))
        return
      }
      if (!root) {
        res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'No vault is open in Galaxy' } }))
        return
      }
      // n8n has no one to ask, so approvals are not offered over HTTP.
      const out = msg.params?.name === 'approve' ? null : await handle(root, msg as Parameters<typeof handle>[1])
      if (!out) {
        res.writeHead(202).end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
      if (msg.method === 'tools/call' && msg.params?.name === 'write_note') opts.onWrite()
    })
  })
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(opts.port ?? VAULT_HTTP_PORT, '127.0.0.1', done)
  })
  return (): void => {
    server.closeAllConnections()
    server.close()
  }
}
