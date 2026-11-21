import assert from 'node:assert/strict'
import { test } from 'node:test'
import { guidePrompt, parseGuide } from './guide.ts'

test('parseGuide accepts a step or the end, and rejects anything else', () => {
  assert.deepEqual(parseGuide('Here: {"x": 120, "y": 40, "say": "Click File"}', 1280, 720), { done: false, x: 120, y: 40, say: 'Click File' })
  assert.deepEqual(parseGuide('{"done": true, "say": "All set"}', 1280, 720), { done: true, say: 'All set' })
  assert.throws(() => parseGuide('I think you should click File', 1280, 720), /did not give/)
  assert.throws(() => parseGuide('{"x": 2000, "y": 40, "say": "Click"}', 1280, 720), /outside the screen/)
  assert.throws(() => parseGuide('{"x": 10, "y": 40}', 1280, 720), /did not say/)
})

test('guidePrompt lists earlier steps and the screenshot size', () => {
  const p = guidePrompt('Export a PDF', ['Click File'], 1280, 720)
  assert.match(p, /Goal: Export a PDF/)
  assert.match(p, /1\. Click File/)
  assert.match(p, /1280x720/)
})
