import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transcribe } from './speech.ts'

test('transcribe checks its input and treats silence as nothing heard, without loading the model', async () => {
  await assert.rejects(transcribe('not audio', ''), /No audio/)
  await assert.rejects(transcribe(new Float32Array(16_000 * 301), ''), /5 minutes/)
  assert.equal(await transcribe(new Float32Array(16_000).fill(0.001), ''), '')
})
