import { test, expect } from 'claude-code/testing'

test('submitting a prompt passes it through untouched while Safari opens on the side', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  const { text } = await $.prompt.submit({ text: 'fix the bug' })
  expect(text).toBe('fix the bug')
})
