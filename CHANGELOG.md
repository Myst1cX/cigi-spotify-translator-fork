# Cigi Spotify Translator - Changelog

## v1.0.fork

### What changed (plain-language summary)

- **Translate is now a button you click, not something running in the background.** Before, it kept re-translating automatically as lyrics changed, which could get confused if you clicked fast or switched languages mid-translation. Now it only translates when you tell it to, and it handles rapid clicks/language switches cleanly.
- **Lyrics detection works again.** Spotify changed its page code at some point, which silently broke the old version. Fixed.
- **Translations no longer randomly disappear** while a song plays or when you click to jump to a different lyric line.
- **The language/Translate bar now stays fixed at the top of the screen** while you scroll through lyrics, instead of scrolling away or sitting in the wrong place.
- **Translations are now remembered.** If you've already translated a song into a language before, opening it again is instant - no waiting on a translation request. You can view or clear this saved cache from the Tampermonkey menu.
- **Two small icons now show up briefly** next to the Translate button: one when a translation is freshly saved, one when a translation is loaded instantly from memory - so you can tell at a glance what just happened.
- **Optional debug logging**, off by default, toggleable from the Tampermonkey menu, for anyone who wants to see what the script is doing under the hood.

### Technical detail

- **Translation trigger:** Removed the 2-second polling loop and the `MutationObserver`-based auto-retranslate. Translation now only runs on an explicit Translate click, gated by a generation-counter state machine: a repeat click for the same language while a run is in flight is ignored (lets it finish), a click for a different language discards the in-flight run's results when they arrive and starts fresh. Selecting a language in the dropdown no longer auto-triggers a translation.
- **Lyrics detection:** Updated selectors from the retired `[data-testid="fullscreen-lyric"]` / `[data-testid="lyrics-container"]` to the current `[data-testid="lyrics-line"]`.
- **Translation persistence during playback:** Spotify's lyrics view is React-owned, so highlight/seek changes re-render a line's children and wipe out injected translation `<div>`s even though the translation hasn't changed. Fixed with an in-memory `original → translated` cache plus a repair-only `MutationObserver` that reinserts missing translations with zero network calls. This observer is rebuilt on every new translation run and disconnected at the start of the next.
- **Header positioning:** Replaced `position: sticky` (broken by an ancestor `transform` from Spotify's OverlayScrollbars) with `position: fixed`, appended to `document.body` and kept in sync with `.main-view-container`'s bounding box via a `ResizeObserver` (catches sidebar collapse / Now Playing View, which don't fire a resize event) plus a `window resize` fallback. An in-flow spacer prevents lyric lines from rendering underneath it. Header now fully mounts on lyrics-open and unmounts on lyrics-close, cleaning up all observers/timeouts/state each time.
- **Persistent cache:** Added `PersistentCache`, backed by `GM_setValue`/`GM_getValue`, keyed on `${trackId}::${langCode}` so multiple languages can be cached per song. Song identity prefers the real Spotify track ID (read from the `[data-testid="context-link"]` anchor), falling back to a title-artist string. Cache is checked before any network call; a hit skips translation entirely, a miss runs translation as before and writes the result to the cache. Eviction is count-based (oldest-timestamp-first, LRU-touch on hit). Two new Tampermonkey menu commands: **"Cigi: Show Translation Cache"** and **"Cigi: Clear Translation Cache."**
- **Cache feedback icons:** Two separate SVG icons (folder+checkmark for "just cached," database+checkmark for "loaded from cache") share one positioning slot so they render in the exact same spot, each with its own fade-in/2s-timeout/cleanup so rapid language switching can't make them interfere with each other.
- **Debug logging:** Added `dbgLog()`, gated by a `debugEnabled` flag persisted via `GM_setValue`/`GM_getValue`. Toggle via a **"Debug Logging (Console)"** Tampermonkey menu command - takes effect immediately, no reload needed.
- **New permissions (`@grant`):** `GM_registerMenuCommand`, `GM_unregisterMenuCommand`, `GM_getValue`, `GM_setValue` (v1.0 had none).

### Summary: What's different from v1.0

| Area | v1.0 | v1.0.fork |
|---|---|---|
| Translation trigger | Auto-translated on every lyric DOM change + a 2s polling loop | Manual - only on Translate click or language change, with a generation-counter state machine |
| Lyrics detection | `[data-testid="fullscreen-lyric"]` / `[data-testid="lyrics-container"]` (retired by Spotify) | `[data-testid="lyrics-line"]` |
| Translation persistence during playback | Could vanish on seek/highlight changes | Repaired automatically via a cache + repair-only observer, no network calls |
| Header positioning | Inserted in-flow at the top; scrolled away with content | Fixed-position, synced to `.main-view-container`; stays pinned regardless of scrolling |
| Header lifecycle | Created once, never removed | Mounts on lyrics-open, fully unmounts on lyrics-close, cleans up all observers/timeouts/state |
| Caching | None - every open re-translated from scratch | Persistent, cross-session, cross-language cache, count-based LRU eviction, viewable/clearable via menu |
| Visual feedback | None | Two fade-in icons: "just cached" vs. "loaded from cache" |
| Debugging | None | Toggleable debug logging via Tampermonkey menu |
| Permissions (`@grant`) | `none` | `GM_registerMenuCommand`, `GM_unregisterMenuCommand`, `GM_getValue`, `GM_setValue` |

## v1.0.1.fork

### What changed (plain-language summary)

- **The header no longer gets stuck on-screen when the Library overlay opens** (spotifuck-mobile.user.js only) - it now hides for Library the same way it already did for Home/Search.
- **The Translate button no longer renders on top of Spotifuck Mobile's Now Playing View, Connect, or Queue overlays.** It stayed correctly behind the lyrics view itself, but its z-index was high enough to punch through those overlays too.

### Technical detail

- **Header visibility on Library overlay:** The header's hide/show logic already reacted to Home/Search views; extended the same check to cover the Library overlay (spotifuck-mobile.user.js exclusive), which was previously left out and let the header persist over it.
- **Header z-index:** The header's `z-index: 9999` (inherited by the Translate button) was high enough to render above Spotifuck Mobile's NPV/Connect/Queue overlay views instead of staying behind them. Lowered to `1000`, matching the language dropdown's existing z-index - enough to stay above the lyrics view, but no longer above those overlays (spotifuck-mobile.user.js exclusive).

## v1.0.2.fork

### What changed (plain-language summary)

- **Fixed the Translate button appearing to float on top of NPV/Queue/Connect overlays**, even though its z-index was already correct and its neighbor, the language dropdown, correctly stayed hidden in the same situation.

### Technical detail

- **Root cause was never z-index or stacking.** Any panel opening (native docking, or spotifuck-mobile.user.js's `width:100vw` squeeze on mobile) shrinks `.main-view-container`, which `positionHeader()` mirrors onto the header. When that squeeze goes all the way to `width: 0` (spotifuck-mobile's mobile takeover case), the header becomes a 0-width fixed box, and its still-flexed, still-centered children spill out from that collapsed midpoint in opposite directions: the language dropdown spills left into negative, off-screen coordinates, while Translate (later in flex order) spills right back onto visible ground and just sits there over whatever's underneath.
- **Fix:** `positionHeader()` now hides the header via `visibility: hidden` (not `display: none`, which would zero out `offsetHeight` and desync the scroll spacer) whenever `.main-view-container`'s measured width collapses to `0`, and restores it once real space is back. Self-contained - no dependency on spotifuck-mobile's presence or selectors, so it's a no-op (header behaves exactly as before) when that script isn't installed.

## v1.0.3.fork

### What changed (plain-language summary)

- **A small red "✕" button now sits next to Translate**, letting you clear the translation currently on screen without touching what's saved in the cache. Click Translate again afterwards and it reloads instantly, same as before.
- **Translate and the new remove button now line up cleanly** on an identical footprint, regardless of padding/font differences between them.

### Technical detail

- **New `removeTranslation()` function:** Clears the currently displayed translation from the DOM only - the persistent cache is untouched, so re-clicking Translate afterwards still reloads instantly from cache. Adapted from pip-gui-stable's `removeTranslatedLyrics()` to cigi's extra state:
  - Bumps `translateGeneration` and resets `isTranslating`/`translatingForLang`, so an in-flight translation run's results are discarded instead of landing back in the DOM after removal (same technique `removeHeader()` already used for unmount).
  - Disconnects the repair `MutationObserver` *before* removing the lines - otherwise it would see them vanish and immediately reinsert them from its own `lineTranslationCache`.
  - Resets both cache-feedback icons (and clears their pending fade timeouts) so a stale "just cached"/"cache hit" badge can't keep glowing after the translation it refers to has been removed.
- **New remove button:** Small red "✕" button (`data-cigi-remove-btn`), added next to Translate, wired to `removeTranslation()` on click. Uses Spotify's own `#e22134` red (the same one used for its Explicit/live badges) with a hover-darken to `#c11a2b`, deliberately calmer than Translate's `#1db954` green so it reads as a lightweight companion action rather than a second equally-weighted button.
- **Button sizing:** Both Translate and the remove button now explicitly set `height: 36px` with `box-sizing: border-box` and flex-centered content, so they sit on an identical footprint regardless of padding/font differences. The remove button drops Translate's `min-width: 100px` in favor of tight horizontal padding, keeping it visually compact.

### Summary: What's different from v1.0.2.fork

| Area | v1.0.2.fork | v1.0.3.fork |
|---|---|---|
| Clearing a translation | Not possible - only re-translating or closing lyrics | New "✕" button clears the displayed translation (DOM only), cache stays intact |
| Button sizing | Translate used `padding: 8px 16px`, no explicit height | Translate and remove button both explicit `height: 36px`, `box-sizing: border-box`, flex-centered |
| In-flight run on clear | N/A | Clearing bumps the generation counter, discarding any in-flight translation results |
| Cache-feedback icons on clear | N/A | Both icons (and their fade timeouts) reset so no stale badge lingers after removal |

## v1.0.4.fork

### What changed (plain-language summary)

- **The Translate header no longer floats on top of Spotify Lyrics+'s popup window.** If you use the separate "Spotify Lyrics+" script and its floating lyrics popup happens to overlap where our header sits, our header now ducks out of the way instead of covering it.

### Technical detail

- **Root cause was not z-index.** Spotify Lyrics+'s popup (`#lyrics-plus-popup`) sets `z-index: 100000`, which should comfortably beat our header's `z-index: 1000` - but Lyrics+ appends that popup *inside* `.main-view-container`, the same element that sits under an ancestor `transform` (from Spotify's OverlayScrollbars) that our own header is deliberately appended to `document.body` to escape (see v1.0.fork). That `transform` creates a separate stacking context, so the popup's `z-index: 100000` is only ever compared against other elements trapped inside that same context - it's never actually compared to our header's `z-index` at all. Our header, living in the root stacking context, ends up outranking that entire subtree regardless of what z-index Lyrics+ used internally.
- **Fix:** since this is a stacking-context issue rather than a numbers issue, `positionHeader()` now measures the Lyrics+ popup's actual on-screen box (treated as absent if it's closed, `display: none`, `visibility: hidden`, or fully transparent) and compares it against the header's own box. On overlap, the header hides via the same `visibility: hidden` technique already used for the NPV/Queue/Connect collapse case - so it only ducks when the two actually intersect, not any time Lyrics+ happens to be open elsewhere on screen.
- **Live tracking while dragging/resizing:** Lyrics+ moves its popup via direct inline `style.left/top/width/height` writes, which fire neither a `.main-view-container` resize nor our existing `ResizeObserver`. A new `MutationObserver` watches the popup's `style` attribute directly so the overlap check stays live during drag/resize. A second `MutationObserver` on `document.body` (with `subtree: true`, since Lyrics+ nests the popup inside `.main-view-container` rather than appending it straight to `body`) starts and stops that watch as the popup is created or removed.
- **Lifecycle:** both observers start in `createHeader()` and are torn down in `removeHeader()`, alongside the header's other observers/state. Self-contained - a no-op (header behaves exactly as before) when Spotify Lyrics+ isn't installed.

## v1.0.5.fork

### What changed (plain-language summary)

- **Debug logging now works inside the Spotifuck app.** The app has no userscript menu, so the "Debug Logging (Console)" switch could never be turned on there and the script's debug lines were never produced. They now show up in the app's own Logger (Settings > Logger, Source = userscripts, or search `tag:us.cigi`) whenever Debug Logging is switched on in the app's Settings. Needs Spotifuck app v1.52 or newer.
- **Nothing changes anywhere else.** In a normal browser or on an app without the Logger, the script behaves exactly as before, and the console switch in the userscript manager works as it always did.

### Technical detail

- **App Logger bridge:** `dbgLog()` now also forwards its line to `window.AndBridge.dbgt('l', 'us.cigi-spotify-translator-fork', line)`. That tag is the same one the Logger derives from this script's console output, so Source = userscripts picks it up. The app gates it on its own Settings > Debug Logging switch; `appLogOn()` asks first (`AndBridge.dbgt` exists and `getDebugLogEnabled()` is true), so details aren't serialized while that is off. Extra arguments are joined onto the line (`appLogText()`: strings as-is, errors as their message, everything else through `JSON.stringify`).
- **`positionHeader()` lines:** these fire on every resize and popup-drag tick and their coordinates change each time, which would fill the app's 4000-line buffer. On the app path they are forwarded only when the visible/overlap state changes; the coordinates are left out of that comparison. Every other line is forwarded as-is, repeats included.
- **Calls `AndBridge` directly, not `window.dbg`:** the app evals this file in the global scope, so a top-level `dbg` here would replace the app's own `window.dbg` helper.
- **Console path unchanged:** the `debugEnabled` flag (`GM_setValue`/`GM_getValue`) and the "Debug Logging (Console)" menu command work as before. In a plain userscript manager, or an app without `dbgt`, the new code does nothing. No call site changed.

## v1.0.6.fork

### What changed (plain-language summary)

- **The Translate header no longer shows up on Home and Search.** It was appearing on every screen as soon as Spotify's Now Playing panel was loaded, instead of only when the lyrics view is open. It now mounts for the real lyrics view only.
- **New diagnostic line for the app Logger / console**, off unless logging is on, so the next time Spotify changes its layout the cause is quick to find. Normal use is unaffected.

### Technical detail

- **Root cause:** Spotify's Now Playing panel carries a small lyrics preview card (`[data-testid="lyrics-npv-section"]`, about 7 `lyrics-line` elements, only 1-2 of them on screen) that stays in the page whenever the panel is rendered, including on Home and Search. `watchLyricsPresence()` treated any `[data-testid="lyrics-line"]` as "the lyrics view is open", so the card's lines mounted the header everywhere. On the real lyrics view the card is not present and the page has the full set of lines (46 in the log it was found from, 8-13 on screen).
- **Fix:** new `getLyricLines()` returns the `lyrics-line` elements that are not inside `NPV_LYRICS_CARD` (`el.closest('[data-testid="lyrics-npv-section"]')`). It is used by the header's presence check in `watchLyricsPresence()`, by `repairMissingTranslations()` and `attachRepairObserver()`, and `translateLyrics()` applies the same filter to its `[data-testid="lyrics-line"] div` candidates (now an array, still indexed and iterated the same way). A translation therefore can never be written into the preview card. Lyrics-view detection is otherwise unchanged.
- **Diagnostic (`diagScene()`):** once a second, from `watchLyricsPresence()`, it builds one `scene:` line: route, `lyrics-line` count and how many are on screen, every `data-testid` containing "yric" with the same two counts, the first line's ancestor chain (up to six levels, with tag, id, `data-testid` and `aria-label`), whether the header is mounted, `.main-view-container` width and the `body` classes. It goes through `dbgLog()` only when the line differs from the last one, so it uses the same app Logger bridge and tag as the other lines (v1.0.5).
- **Gated:** `diagScene()` returns immediately unless `appLogOn()` (app Settings > Debug Logging) or `debugEnabled` (console menu switch) is true, so with logging off it does no querying or measuring. With logging on it checks under a hundred elements once a second. No behaviour change.
