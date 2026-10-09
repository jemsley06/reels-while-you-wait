import type { Register } from 'claude-code'
import { AUTOSCROLL_JS } from './autoscroll'

const OPEN = `use framework "AppKit"
use scripting additions
set prev to path to frontmost application as text
-- the screen holding the focused window; center a phone-sized 420x760 window on it
set {{sx, sy}, {sw, sh}} to current application's NSScreen's mainScreen's frame() as list
set x to sx + (sw - 420) div 2
set y to (sh - 760) div 2
tell application "Safari"
  make new document with properties {URL:"https://www.instagram.com/reels/"}
  set w to front window
  set bounds of w to {x, y, x + 420, y + 760}
  set wid to id of w
end tell
-- not \`activate\`: that raises every Safari window over Claude; this raises only the new (key) one
tell application "System Events" to set frontmost of process "Safari" to true
return (wid as text) & linefeed & prev`

const INJECT = `on run argv
  tell application "Safari" to do JavaScript (item 2 of argv) in current tab of (first window whose id is (item 1 of argv as integer))
end run`

const CLOSE = `on run argv
  tell application "Safari" to close (every window whose id is (item 1 of argv as integer))
  -- hand focus back to the app you were in, unless you've since moved on to something else
  tell application "System Events" to set stillWatching to frontmost of process "Safari"
  if stillWatching then tell application (item 2 of argv) to activate
end run`

export const register: Register = on => {
  // shortcut: window id lives in a module variable, so a mod reload mid-turn leaves that window open.
  let windowId: string | undefined
  let prevApp = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'reels', description: 'Turn Reels-while-you-wait on or off' })
    return next(e)
  })

  on('command.run', { command: 'reels' }, async $ => {
    const isOff = !(await $.store.get('off'))
    await $.store.set('off', isOff)
    return { text: `Reels while you wait: ${isOff ? 'off' : 'on'}` }
  })

  on('prompt.submit', async ($, e, next) => {
    // shortcut: skips every slash command (they may never end a turn, which would strand the window); skills invoked by slash won't get reels
    if (!windowId && !e.text.startsWith('/') && !(await $.store.get('off'))) {
      void (async () => {
        const opened = await $.process.run(['osascript', '-e', OPEN])
        if (opened.exitCode !== 0) return $.ui.toast(`reels: ${opened.stderr.trim()}`)
        ;[windowId, prevApp] = opened.stdout.trim().split('\n')
        await $.clock.sleep(5000) // let Instagram's page mount its <video>s
        const injected = await $.process.run(['osascript', '-e', INJECT, windowId, AUTOSCROLL_JS])
        if (injected.exitCode !== 0)
          $.ui.toast('reels: autoscroll needs Safari → Settings → Developer → Allow JavaScript from Apple Events')
      })().catch(err => $.ui.toast(`reels: ${err}`))
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // never block your prompt over a reels hiccup

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && windowId) {
      const id = windowId
      windowId = undefined
      await $.process.run(['osascript', '-e', CLOSE, id, prevApp]).catch(() => {})
    }
    return result
  })
}
