# reels-while-you-wait

A Claude Code mod for macOS. When you submit a prompt, it opens Instagram Reels in a small window centered on your screen (in Safari, so your Chrome windows stay put), scrolls to the next reel each time one finishes, and closes the window and hands focus back to you when Claude is done.

## Install

In a Claude Code terminal session:

```
/plugin install reels-while-you-wait --marketplace jemsley06/reels-while-you-wait
```

Answer `y` to add the marketplace, then press Enter for the user scope.

## One-time setup

1. **Safari autoscroll:** Safari → Settings → Advanced → tick *Show features for web developers*, then Settings → Developer → turn on *Allow JavaScript from Apple Events*. Without it, Reels opens and closes but won't scroll.
2. **Instagram:** log in to Instagram in Safari.
3. **macOS permissions:** the first run asks to let Claude control Safari and System Events. Allow both.

## Turning it on and off

Type `/reels` to toggle it. Your choice is remembered across sessions.

## Notes

- Prompts that start with `/` (slash commands) never open Reels.

- If Claude is in macOS full-screen mode, the Reels window can't float over it; use a normal window.
- The window is a fixed 420×760, centered on the screen you're working on.
