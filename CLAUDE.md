# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Webtest" is a Manifest V3 Chrome extension (vanilla JS — no build step, no
bundler, no dependencies, no tests). Its real purpose is a **QA tester's
bug-capture tool**: a tester finds a bug on a web app, captures it (with a
screenshot, the page environment, and the offending element), optionally
annotates it, and sends it to **ClickUp as a subtask** (one bug = one subtask).
Plain note-taking still works, but the product is aimed at testers.

**Hard constraints (do not violate):** no backend, no server, no database, ever.
Everything runs client-side in the extension. ClickUp auth is each user's own
Personal API token. Keep new features serverless and token-based.

## Capture methods (how a tester reports a bug)

1. **Element picker** (primary) — devtools-style: hover highlights elements,
   click captures one. Started from the **🎯 button** in the popup header or the
   keyboard shortcut **`Ctrl+Shift+E`** (Mac `Cmd+Shift+E`). Captures a robust
   CSS selector + element details, auto-boxes the element on the screenshot, and
   opens the capture modal in "🐞 Report Bug" mode (empty description field).
2. **Text selection** (secondary) — Grammarly-style floating icon on text
   selection → capture modal ("💾 Save Note" mode, description prefilled with the
   selected text). Also available via the right-click "Save selection to Webtest" context
   menu (text only, no screenshot/element).

Both paths open the **same capture modal**, which auto-attaches a **screenshot**
of the visible tab and an **environment** block, and offers an **annotation
editor** (box / circle / arrow / free-pen + colors + undo/clear) over the
screenshot. From the modal the tester can **Save Note** (store locally) or
**Send to ClickUp** (push directly, no local copy).

## Running / debugging

There is nothing to build or compile. To run:

1. `chrome://extensions` → enable Developer mode → "Load unpacked" → select this
   folder.
2. After editing a file, click the reload icon on the extension card. The
   **content script reload also requires reloading the target web page**; the
   **service worker** (`background.js`) must be reloaded from its "service
   worker" link or via the extension card.
3. **Manifest changes do NOT take effect on content scripts until you reload the
   extension AND reload open tabs.** Editing `manifest.json` (e.g. the keyboard
   shortcut) requires a full reload. The shortcut binding is also only a
   _suggestion_ — verify/rebind at `chrome://extensions/shortcuts`.
4. Debug surfaces separately: popup via right-click → Inspect on the popup;
   service worker via the extension card's "service worker" link; content script
   via the page's own DevTools console.

`icons/icon.png` is referenced by the manifest at all sizes (16/48/128) — keep
it present or the extension fails to load.

### Permissions (manifest)

- `permissions`: `storage`, `contextMenus`, `unlimitedStorage` (screenshots are
  large base64 blobs in `storage.local`).
- `host_permissions`: `https://api.clickup.com/*` (REST + attachment upload) and
  `<all_urls>` (required so `chrome.tabs.captureVisibleTab` works from the
  in-page flows — `activeTab` is NOT granted by clicks on our own injected UI —
  and so the popup/background can `sendMessage` to content scripts).
- `commands.pick-element`: the `Ctrl+Shift+E` element-picker shortcut.

## Architecture

Four runtime contexts share three plain-global helper modules. The modules are
loaded two different ways depending on context — **this dual-loading is the
central constraint**:

- **Service worker** (`background.js`) loads them via
  `importScripts("storage.js", "clickup.js", "config.js")`.
- **Extension pages** (`popup.html`, `options.html`) load them via `<script>`
  tags. Script order matters: `clickup.js`/`config.js` before the page
  controller; `storage.js` before `popup.js`.

Because of this, the shared modules must stay framework-free and expose a single
global object (`StorageHelper`, `ClickUpAPI`, `ClickUpConfig`), guarding any
worker-only export with `if (typeof self !== "undefined")`. Do not convert them
to ES modules or add imports.

### The four contexts

- **`content.js`** — injected into `<all_urls>`. Owns both capture paths (text
  selection + element picker), the capture modal, the screenshot annotator, and
  environment/element collection. Has no direct storage access for saving; it
  `sendMessage`s the background. Key pieces:
  - Capture state vars: `currentSelection / currentUrl / currentTitle /
currentEnv / currentScreenshot / currentElement`.
  - **Element picker**: `createPickerUI`, `startElementPicker` /
    `stopElementPicker`, capture-phase handlers (`onPickerMove`, `onPickerClick`,
    `onPickerSuppress`, `onPickerKey`) that suppress page side-effects;
    `buildCssSelector` (prefers `data-testid|test|cy|qa` → unique `#id` →
    `nth-of-type` path, via `CSS.escape`); `collectElementInfo`.
  - **`Annotator`** — canvas module drawing the screenshot + shapes; `load(dataUrl,
{boxRect, dpr})` seeds an auto-box around the picked element (rect is viewport
    CSS px scaled by DPR); `export()` returns a flattened JPEG only if the tester
    drew something (else null → caller keeps the original).
  - **Resilient messaging**: `isExtensionContextValid()` + `safeSendMessage()`
    return `{__contextInvalid:true}` instead of throwing when a stale content
    script (post-reload) talks to a dead `chrome.runtime`. All background
    messaging goes through `safeSendMessage`.
  - `captureScreenshot()` asks the background for `captureVisibleTab`. Screenshots
    are taken **with our own overlay/icon hidden** so they aren't in the shot.
  - Listens for `toggleExtension` and `startElementPicker` messages.
- **`background.js`** (service worker) — owns the `contextMenus` "Save selection
  to Webtest" entry, opens options on first install, runs `chrome.commands.onCommand`
  (`pick-element` → message the active tab), and is the message hub:
  - `captureVisibleTab` → `chrome.tabs.captureVisibleTab(windowId, {format:"jpeg",
quality:60})`.
  - `saveNote` → `saveNoteFromText(text, url, {title, env, element, screenshot})`
    via `StorageHelper`.
  - `sendNoteToClickUp` → builds the subtask description (text + `Source:` +
    `formatElementForClickUp` + `formatEnvForClickUp`), creates the subtask, then
    best-effort uploads the screenshot as an attachment.
- **`popup.js`** / `popup.html` — the note manager UI: add/edit/delete/reorder
  notes, the enable/disable toggle, the **🎯 Pick element** button
  (`handlePickElement` → message active tab → `window.close()`), and the per-note
  "send to ClickUp" button. Renders element selector chips, env chips, and a
  click-to-expand screenshot thumbnail on each card. Talks to storage directly
  via `StorageHelper`; routes ClickUp pushes through the background.
- **`options.js`** / `options.html` — onboarding + settings. Walks Workspace →
  Space → Folder → List → parent task and saves the ClickUp connection. Calls
  `ClickUpAPI` directly. Doubles as the ongoing settings page.

### Data model

All persistence is `chrome.storage.local`. Three keys:

- `notes` — the ordered array of note objects. A note is:
  `{ id (crypto.randomUUID), text, url|null, title|null, env|null, element|null,
screenshot|null, createdAt, updatedAt, index }`. (Notes are deleted on a
  successful ClickUp sync, so no `clickup*` fields are persisted.)
  - `env` = `{ browser, browserVersion, os, viewport, screen, dpr, userAgent,
capturedAt }` (from `detectEnv()` in `content.js`).
  - `element` = `{ selector, tag, id, classes, text, attrs:{testid, name, type,
role, ariaLabel, href}, rect:{x,y,w,h} }` (from `collectElementInfo`).
  - `screenshot` = a JPEG **data URL** (annotated if the tester drew on it).
- `clickupConfig` — see the shape documented at the top of `config.js`.
- `extensionEnabled` — boolean; absence means enabled (default true). Only gates
  the text-selection floating icon; the element picker works regardless (explicit
  action).

**Ordering invariant:** notes live in a single array and every mutation in
`storage.js` (`addNote`, `deleteNote`, `moveNoteUp/Down`) re-derives each note's
`index` to match its array position. New notes go to the front (`unshift`,
index 0). Keep `index` consistent with array position across all methods.

**Storage cost / known drawback:** screenshots are base64 JPEGs (~150KB–1.3MB
each depending on DPR) stored inline in the `notes` array. `getAllNotes()` /
`saveAllNotes()` read+write the WHOLE array on every operation, so many large
screenshots degrade popup responsiveness well before disk runs out.
`unlimitedStorage` removes the 10MB cap, and **sync auto-purges** the note (see
below) so it stays bounded in the ClickUp flow. If this becomes a problem,
decouple screenshots into per-id keys / IndexedDB and downscale before storing.

### ClickUp integration

Auth is a **Personal API token** (`pk_...`) sent straight in the `Authorization`
header — no OAuth, no backend. `clickup.js` (`ClickUpAPI`) is a thin wrapper over
ClickUp REST v2; `config.js` (`ClickUpConfig`) reads/writes the saved connection
and exposes `isConnected()`. A "not connected" push returns
`{ success:false, notConnected:true }` so the UI can prompt for settings.

**Task mode** (`config.taskMode`, set in options Step 3, default `"subtask"`):
- `"subtask"` — each capture becomes a subtask of `config.parentTaskId` (needs
  token + listId + parentTaskId to be connected).
- `"task"` — each capture becomes a top-level task directly in the List (needs
  only token + listId; `parentTaskId` is null). `background.js` omits the
  `parent` field on `createTask` in this mode. Older saved configs without
  `taskMode` are treated as `"subtask"`.

- **Subtask description** is built like a bug report: the text, the source URL,
  an `🎯 Element` block (selector/tag/test-id/text), and a `🐞 Captured
environment` block.
- **Screenshot attachment**: `ClickUpAPI.uploadAttachment(token, taskId, blob,
filename)` POSTs `multipart/form-data` to `/task/{id}/attachment`. Do NOT set
  `Content-Type` manually — the browser sets the multipart boundary. The blob is
  obtained from the screenshot data URL via `fetch(dataUrl).then(r=>r.blob())`.
  Attachment failure is non-fatal (the subtask already exists).
- **Auto-purge on sync (sync = move, not copy)**: when a saved note is
  successfully sent from the popup (`handleSendToClickUp`), it is **deleted
  locally** and a toast with an "Open in ClickUp" link is shown. Direct sends
  from the capture modal never create a local note in the first place.

## Conventions

- All storage/API helpers are `async/await` and wrap their bodies in try/catch,
  logging via `console.error`. Read paths swallow errors and return a safe
  default (`[]` / `null`); write paths re-throw so callers can react.
- Any text rendered into innerHTML must be escaped: `escapeHtml()` in `popup.js`,
  `escapeForHtml()` in `content.js` (note text, URLs, selectors, and element text
  are user/page-controlled).
- All content-script → background messaging must go through `safeSendMessage()`
  so a stale post-reload content script fails gracefully (shows a "reload the
  page" hint) instead of throwing "Extension context invalidated".
- Screenshots must be captured with our own injected UI hidden (set
  `display:none` / hide overlays before `captureVisibleTab`).
- UI is hand-built DOM + inline SVG icons; no template engine. Feedback is done
  with transient button-state swaps, the popup's `showToast()`, and `alert()` in
  the content script.

## Not yet built (tester roadmap)

The popup's manual "Add note" path does not capture screenshot/env/element (only
the content-script paths do). The picker does not pierce shadow DOM / iframes.
Discussed but unbuilt: console/network error capture, structured bug template
(Steps/Expected/Actual), severity→ClickUp priority, test sessions + bulk send.
