# Keyboard shortcuts

Every keyboard shortcut goes through one service, `frontend/src/services/shortcuts/`. Nothing else listens for keys to trigger a desktop or app action (fields such as the search box or the inline rename keep their own Enter / Esc).

## For people

**Settings → Shortcuts** (desktop web) lists everything, grouped by where it works: click a shortcut and press the new keys (`Esc` cancels), `+` adds a second binding, `×` removes one, ↺ restores the default. If the keys are taken NodeDesk says by what and offers to replace it. Overrides are stored in your settings (`shortcuts`), so they follow you across browsers.

- `Mod` in a binding is ⌘ on a Mac and Ctrl elsewhere, so a shortcut you record on one machine works on the other.
- Keys are physical (`KeyboardEvent.code`), so ⌥ / AltGr characters and other layouts do not change them.
- Global shortcuts must include Ctrl, Alt or ⌘ (or be an F key); bare keys would fight with typing.
- Browsers keep some combinations for themselves (`Ctrl+T`, `Ctrl+W`, `Ctrl+N`, `Ctrl+Tab`…): the page never sees them, which is why the Terminal defaults to `Alt+Shift`.

### Inside the Terminal

A shell needs its own keys (`Ctrl+C`, `Ctrl+K` = kill line, `Alt+B`…). While a terminal has focus, desktop-wide shortcuts only fire if they use ⌘ or `Ctrl+Shift`; a plain `Ctrl+K` goes to the shell. The Terminal's own shortcuts (new tab, close tab, next / previous tab, clear, copy, select all, text size) win over global ones.

## For developers

```
services/shortcuts/
  types.ts        ShortcutDef, ShortcutHandler
  global.ts       desktop-wide shortcuts
  catalog.ts      global.ts + every apps/<name>/shortcuts.ts (auto-discovered)
  keys.ts         parsing, matching and formatting key combinations
  bindings.ts     defaults + the user's overrides, conflict detection
  dispatcher.ts   the single capture-phase keydown listener
  hooks.ts        useShortcut / useShortcuts / useShortcutLabels / useShortcutSettings
```

Add a shortcut in two steps.

1. Declare it. In an app, create `apps/<name>/shortcuts.ts` (the scope is the app's id); for something desktop-wide, add it to `global.ts`:

   ```ts
   export default defineShortcuts([
     { id: "files.rename", scope: "files", get label() { return t("shortcut.files_rename") }, keys: ["F2"] },
   ])
   ```

   `mac` overrides the defaults on Apple platforms; `fixed: true` lists it in Settings without letting it be edited. Add the label to `i18n/en.ts` and `pt.ts`.

2. Attach behaviour from a component:

   ```ts
   useShortcuts({ "files.rename": () => (selected.length === 1 ? setRenaming(selected[0].path) : false) }, { within: scroller })
   ```

   Inside a window a handler only runs while that window is focused and the key was typed inside it (dialogs are excluded), plus, with `within`, inside that element. Return exactly `false` to decline: the key then goes to the next handler or to the page. Show the current binding in menus with `useShortcutLabels()`.

Text fields keep their editing keys (`Ctrl+A/C/X/V/Z`) and plain keys; modifier shortcuts such as `Ctrl+S` still fire from inside an input or the code editor.
