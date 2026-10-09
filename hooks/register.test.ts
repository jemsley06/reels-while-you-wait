import { test, expect, mock } from 'claude-code/testing'

test('submitting a prompt passes it through untouched while Safari opens on the side', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  const { text } = await $.prompt.submit({ text: 'fix the bug' })
  expect(text).toBe('fix the bug')
})

test('/reels toggles off, then back on', async ($, on) => {
  mock.store(on)
  expect((await $.command.run({ command: 'reels', args: '' })).text).toBe('Reels while you wait: off')
  expect((await $.command.run({ command: 'reels', args: '' })).text).toBe('Reels while you wait: on')
})
