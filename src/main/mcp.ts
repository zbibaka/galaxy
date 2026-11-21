// Vault MCP server over stdio (newline-delimited JSON-RPC). Started by the Claude CLI as:
//   <electron> out/main/mcp.js <vault folder>   with ELECTRON_RUN_AS_NODE=1
import { createInterface } from 'node:readline'
import { handle } from './vaultMcp'

const root = process.argv[2]
if (!root) {
  process.stderr.write('usage: mcp.js <vault folder>\n')
  process.exit(1)
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n')
    return
  }
  void handle(root, msg).then((out) => out && process.stdout.write(JSON.stringify(out) + '\n'))
})
