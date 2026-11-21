import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Fetch, routeRequest, suggestFiling, writeRisk } from './jev.ts'

/** A fake Jev that answers from `reply(questions, state)` and records what it was sent. */
function fakeJev(reply: (questions: Record<string, unknown>, state: string) => object, status = 200) {
  const sent: { state: string; questions: Record<string, unknown>; auth: string }[] = []
  const f = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    sent.push({ state: body.state, questions: body.questions, auth: (init.headers as Record<string, string>)['authorization']! })
    return new Response(JSON.stringify({ answers: reply(body.questions, body.state) }), { status })
  }) as unknown as Fetch
  return { f, sent }
}

const choice = (choice: string, p: number) => ({ choice, probabilities: { [choice]: p } })

test('router uses the fast model only for small jobs it is sure about', async () => {
  const sure = fakeJev(() => ({ size: choice('small', 0.92) }))
  assert.deepEqual(await routeRequest('k', 'fix a typo in Inbox', sure.f), { model: 'haiku', note: 'Jev: small job (92% sure), using the fast model' })
  assert.equal(sure.sent[0]!.auth, 'Bearer k')

  const unsure = fakeJev(() => ({ size: choice('small', 0.55) }))
  assert.equal((await routeRequest('k', 'tidy things', unsure.f)).model, undefined)
  const large = fakeJev(() => ({ size: choice('large', 0.9) }))
  assert.equal((await routeRequest('k', 'plan my month', large.f)).model, undefined)
})

test('guardrail flags lost content or injected instructions and fails loudly', async () => {
  const c = { prompt: 'add a line', path: 'A.md', before: 'old', after: 'new' }
  assert.equal(await writeRisk('k', c, fakeJev(() => ({ loses: { noul: 0.1 }, injected: { noul: 0.2 } })).f), null)
  assert.match((await writeRisk('k', c, fakeJev(() => ({ loses: { noul: 0.8 }, injected: { noul: 0.1 } })).f))!, /remove/)
  assert.match((await writeRisk('k', c, fakeJev(() => ({ loses: { noul: 0.1 }, injected: { noul: 0.7 } })).f))!, /instructions/)
  await assert.rejects(writeRisk('k', c, fakeJev(() => ({}), 401).f), /rejected the API key/)
  await assert.rejects(writeRisk('k', c, fakeJev(() => ({ loses: {}, injected: { noul: 0 } })).f), /no probability/)
})

test('filing keeps only confident picks of a real folder', async () => {
  const jev = fakeJev((_q, state) => (state.includes('Rocket') ? { folder: choice('Projects', 0.9) } : state.includes('Milk') ? { folder: choice('(none)', 0.8) } : { folder: choice('Projects', 0.4) }))
  const notes = [
    { path: 'Rocket.md', content: 'build a rocket' },
    { path: 'Milk.md', content: 'buy milk' },
    { path: 'Maybe.md', content: 'hmm' }
  ]
  assert.deepEqual(await suggestFiling('k', notes, { Projects: ['Galaxy'] }, jev.f), [{ path: 'Rocket.md', folder: 'Projects', confidence: 0.9 }])
  assert.deepEqual(Object.keys((jev.sent[0]!.questions['folder'] as { criteria: object }).criteria), ['Projects', '(none)'])
})
