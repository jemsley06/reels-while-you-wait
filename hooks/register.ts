import type { Register } from 'claude-code'
import { AUTOSCROLL_JS } from './autoscroll'

const OPEN = `use framework "AppKit"
use scripting additions
set prev to path to frontmost application as text
set wasRunning to application "Safari" is running
-- \`launch\` starts Safari without the Start Page window a plain start opens
if not wasRunning then tell application "Safari" to launch
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
return (wid as text) & linefeed & prev & linefeed & wasRunning`

const INJECT = `on run argv
  tell application "Safari" to do JavaScript (item 2 of argv) in current tab of (first window whose id is (item 1 of argv as integer))
end run`

const CLOSE = `on run argv
  -- we launched Safari, so quit it: that also clears the Start Page window Safari opens on launch
  if item 3 of argv is "false" then
    tell application "Safari" to quit
  else
    tell application "Safari" to close (every window whose id is (item 1 of argv as integer))
  end if
  -- hand focus back to the app you were in, unless you've since moved on to something else
  tell application "System Events" to set stillWatching to frontmost of process "Safari"
  if stillWatching then tell application (item 2 of argv) to activate
end run`

export const register: Register = on => {
  // the open in flight, resolving to [windowId, prevApp, wasRunning]; awaited at turn end so a short turn can't miss it
  // shortcut: it lives in a module variable, so a mod reload mid-turn leaves that window open
  let opening: Promise<string[] | undefined> | undefined

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
    if (!opening && !e.text.startsWith('/') && !(await $.store.get('off'))) {
      opening = $.process.run(['osascript', '-e', OPEN]).then(opened => {
        if (opened.exitCode === 0) return opened.stdout.trim().split('\n')
        $.ui.toast(`reels: ${opened.stderr.trim()}`)
      }).catch(err => void $.ui.toast(`reels: ${err}`))
      const mine = opening
      void opening.then(async win => {
        if (!win || opening !== mine) return // turn already ended: injecting now would relaunch a quit Safari
        await $.clock.sleep(5000) // let Instagram's page mount its <video>s
        if (opening !== mine) return
        const injected = await $.process.run(['osascript', '-e', INJECT, win[0], AUTOSCROLL_JS])
        if (injected.exitCode !== 0)
          $.ui.toast('reels: autoscroll needs Safari → Settings → Developer → Allow JavaScript from Apple Events')
      }).catch(() => {}) // the window may already be closed when a turn is short
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // never block your prompt over a reels hiccup

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && opening) {
      const win = await opening
      opening = undefined
      if (win) await $.process.run(['osascript', '-e', CLOSE, ...win]).catch(() => {})
    }
    return result
  })
}
