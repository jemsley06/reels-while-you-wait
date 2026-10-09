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
  set existing to id of every window
  make new document with properties {URL:"https://www.instagram.com/reels/"}
  -- find our window as the new one on Instagram: right after creation \`front window\` can still be one of yours
  set w to missing value
  repeat 50 times
    repeat with o in (every window)
      if (id of o) is not in existing and (URL of current tab of o as text) contains "instagram.com" then set w to contents of o
    end repeat
    if w is not missing value then exit repeat
    delay 0.1
  end repeat
  set bounds of w to {x, y, x + 420, y + 760}
  set wid to id of w
  -- Safari can still open its Start Page a moment after starting; close it so only Reels shows
  if not wasRunning then
    delay 1
    repeat with o in (every window whose id is not wid)
      if (URL of current tab of o as text) is in {"favorites://", "about:blank", "missing value"} then close o
    end repeat
  end if
end tell
-- not \`activate\`: that raises every Safari window over Claude; this raises only the new (key) one
tell application "System Events" to set frontmost of process "Safari" to true
return (wid as text) & linefeed & prev & linefeed & wasRunning`

// every step checks Safari is running first: a \`tell\` to a quit Safari relaunches it, restoring old windows
const INJECT = `on run argv
  if application "Safari" is running then tell application "Safari" to do JavaScript (item 2 of argv) in current tab of (first window whose id is (item 1 of argv as integer))
end run`

const CLOSE = `on run argv
  if not (application "Safari" is running) then return
  -- read before closing: are you still watching, or have you moved on to something else?
  tell application "System Events" to set stillWatching to frontmost of process "Safari"
  tell application "Safari"
    -- we started Safari: quit it unless you have a real page open (decided before closing: closes settle late)
    set yours to 0
    if item 3 of argv is "false" then
      repeat with o in (every window whose id is not (item 1 of argv as integer))
        if (URL of current tab of o as text) is not in {"favorites://", "about:blank", "missing value"} then set yours to yours + 1
      end repeat
    end if
    if item 3 of argv is "false" and yours is 0 then
      quit
    else
      close (every window whose id is (item 1 of argv as integer))
    end if
  end tell
  if stillWatching then tell application (item 2 of argv) to activate
end run`

// DEBUG (temporary)
const dbg = ($: any, msg: string) =>
  $.process.run(['/bin/sh', '-c', 'printf "%s %s\\n" "$(date +%T)" "$1" >> "$2"', 'sh', '[installed] ' + msg, '/private/tmp/claude-501/-Users-jasonemsleymac-Desktop-Personal-Projects-agentic-workflow-max/240fd88b-ea94-4923-a36b-a9801067f33d/scratchpad/reels.log']).catch(() => {})

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
    void dbg($, `prompt.submit opening=${!!opening} off=${await $.store.get('off')}`)
    // shortcut: skips every slash command (they may never end a turn, which would strand the window); skills invoked by slash won't get reels
    if (!opening && !e.text.startsWith('/') && !(await $.store.get('off'))) {
      opening = $.process.run(['osascript', '-e', OPEN]).then(opened => {
        void dbg($, `opened exit=${opened.exitCode} out=${opened.stdout.trim().replace(/\n/g, '|')} err=${opened.stderr.trim()}`)
        if (opened.exitCode === 0) return opened.stdout.trim().split('\n')
        $.ui.toast(`reels: ${opened.stderr.trim()}`)
      }).catch(err => void $.ui.toast(`reels: ${err}`))
      const mine = opening
      void opening.then(async win => {
        if (!win || opening !== mine) return // turn already ended
        await $.clock.sleep(5000) // let Instagram's page mount its <video>s
        if (opening !== mine) return
        const injected = await $.process.run(['osascript', '-e', INJECT, win[0], AUTOSCROLL_JS])
        void dbg($, `injected exit=${injected.exitCode} err=${injected.stderr.trim()}`)
        if (injected.exitCode !== 0)
          $.ui.toast('reels: autoscroll needs Safari → Settings → Developer → Allow JavaScript from Apple Events')
      }).catch(() => {}) // the window may already be closed when a turn is short
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // never block your prompt over a reels hiccup

  on('turn.complete', async ($, e, next) => {
    void dbg($, `turn.complete agentId=${e.agentId} reason=${(e as any).reason} opening=${!!opening}`)
    const result = await next(e)
    if (!e.agentId && opening) {
      const win = await opening
      opening = undefined
      const closed = win && await $.process.run(['osascript', '-e', CLOSE, ...win]).catch(err => ({ exitCode: -1, stderr: String(err) }))
      void dbg($, `closed win=${win?.join('|')} exit=${closed && closed.exitCode} err=${closed && closed.stderr.trim()}`)
    }
    return result
  })
}
