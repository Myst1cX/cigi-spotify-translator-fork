# Cigi Spotify Translator — Changelog

## v2.0

### What changed (plain-language summary)

- **Translate is now a button you click, not something running in the background.** Before, it kept re-translating automatically as lyrics changed, which could get confused if you clicked fast or switched languages mid-translation. Now it only translates when you tell it to, and it handles rapid clicks/language switches cleanly.
- **Lyrics detection works again.** Spotify changed its page code at some point, which silently broke the old version. Fixed.
- **Translations no longer randomly disappear** while a song plays or when you click to jump to a different lyric line.
- **The language/Translate bar now stays fixed at the top of the screen** while you scroll through lyrics, instead of scrolling away or sitting in the wrong place.
- **Translations are now remembered.** If you've already translated a song into a language before, opening it again is instant — no waiting on a translation request. You can view or clear this saved cache from the Tampermonkey menu.
- **Two small icons now show up briefly** next to the Translate button: one when a translation is freshly saved, one when a translation is loaded instantly from memory — so you can tell at a glance what just happened.
- **Optional debug logging**, off by default, toggleable from the Tampermonkey menu, for anyone who wants to see what the script is doing under the hood.

### Technical detail

- **Translation trigger:** Removed the 2-second polling loop and the `MutationObserver`-based auto-retranslate. Translation now only runs on an explicit Translate click, gated by a generation-counter state machine: a repeat click for the same language while a run is in flight is ignored (lets it finish), a click for a different language discards the in-flight run's results when they arrive and starts fresh. Selecting a language in the dropdown no longer auto-triggers a translation.
- **Lyrics detection:** Updated selectors from the retired `[data-testid="fullscreen-lyric"]` / `[data-testid="lyrics-container"]` to the current `[data-testid="lyrics-line"]`.
- **Translation persistence during playback:** Spotify's lyrics view is React-owned, so highlight/seek changes re-render a line's children and wipe out injected translation `<div>`s even though the translation hasn't changed. Fixed with an in-memory `original → translated` cache plus a repair-only `MutationObserver` that reinserts missing translations with zero network calls. This observer is rebuilt on every new translation run and disconnected at the start of the next.
- **Header positioning:** Replaced `position: sticky` (broken by an ancestor `transform` from Spotify's OverlayScrollbars) with `position: fixed`, appended to `document.body` and kept in sync with `.main-view-container`'s bounding box via a `ResizeObserver` (catches sidebar collapse / Now Playing View, which don't fire a resize event) plus a `window resize` fallback. An in-flow spacer prevents lyric lines from rendering underneath it. Header now fully mounts on lyrics-open and unmounts on lyrics-close, cleaning up all observers/timeouts/state each time.
- **Persistent cache:** Added `PersistentCache`, backed by `GM_setValue`/`GM_getValue`, keyed on `${trackId}::${langCode}` so multiple languages can be cached per song. Song identity prefers the real Spotify track ID (read from the `[data-testid="context-link"]` anchor), falling back to a title-artist string. Cache is checked before any network call; a hit skips translation entirely, a miss runs translation as before and writes the result to the cache. Eviction is count-based (oldest-timestamp-first, LRU-touch on hit). Two new Tampermonkey menu commands: **"Cigi: Show Translation Cache"** and **"Cigi: Clear Translation Cache."**
- **Cache feedback icons:** Two separate SVG icons (folder+checkmark for "just cached," database+checkmark for "loaded from cache") share one positioning slot so they render in the exact same spot, each with its own fade-in/2s-timeout/cleanup so rapid language switching can't make them interfere with each other.
- **Debug logging:** Added `dbgLog()`, gated by a `debugEnabled` flag persisted via `GM_setValue`/`GM_getValue`. Toggle via a **"Debug Logging (Console)"** Tampermonkey menu command — takes effect immediately, no reload needed.
- **New permissions (`@grant`):** `GM_registerMenuCommand`, `GM_unregisterMenuCommand`, `GM_getValue`, `GM_setValue` (v1.0 had none).

### Summary: What's different from v1.0

| Area | v1.0 | v2.0 |
|---|---|---|
| Translation trigger | Auto-translated on every lyric DOM change + a 2s polling loop | Manual — only on Translate click or language change, with a generation-counter state machine |
| Lyrics detection | `[data-testid="fullscreen-lyric"]` / `[data-testid="lyrics-container"]` (retired by Spotify) | `[data-testid="lyrics-line"]` |
| Translation persistence during playback | Could vanish on seek/highlight changes | Repaired automatically via a cache + repair-only observer, no network calls |
| Header positioning | Inserted in-flow at the top; scrolled away with content | Fixed-position, synced to `.main-view-container`; stays pinned regardless of scrolling |
| Header lifecycle | Created once, never removed | Mounts on lyrics-open, fully unmounts on lyrics-close, cleans up all observers/timeouts/state |
| Caching | None — every open re-translated from scratch | Persistent, cross-session, cross-language cache, count-based LRU eviction, viewable/clearable via menu |
| Visual feedback | None | Two fade-in icons: "just cached" vs. "loaded from cache" |
| Debugging | None | Toggleable debug logging via Tampermonkey menu |
| Permissions (`@grant`) | `none` | `GM_registerMenuCommand`, `GM_unregisterMenuCommand`, `GM_getValue`, `GM_setValue` |
