// ==UserScript==
// @name         Cigi Spotify Translator 2.0
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Extract, translate, and display Spotify lyrics with a language selector and manual translation trigger
// @author       Raiwulf
// @match        *://*.spotify.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// @homepageURL  https://github.com/Myst1cX/cigi-spotify-translator-fork
// @supportURL   https://github.com/Myst1cX/cigi-spotify-translator-fork/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/cigi-spotify-translator-fork/main/cigi-spotify-translator-fork.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/cigi-spotify-translator-fork/main/cigi-spotify-translator-fork.user.js
// ==/UserScript==
// Changelog:
// 2.0 - Full rewrite of translation triggering, lyrics persistence, header positioning, and caching.
//       Translate is now a manual, on-demand action (was: auto-translated on every lyrics DOM change
//       plus a 2s polling loop). A generation-counter state machine prevents race conditions when
//       clicking Translate repeatedly or switching languages mid-run.
//       Lyrics detection updated for Spotify's current DOM ([data-testid="lyrics-line"]; the old
//       [data-testid="fullscreen-lyric"/"lyrics-container"] selectors were retired by Spotify).
//       Translations no longer disappear during playback or when seeking - a repair-only
//       MutationObserver reinserts them from an in-memory cache whenever Spotify's React re-render
//       wipes them out, with zero extra network calls.
//       The language/Translate header is now fixed-position and stays pinned to the top of the
//       screen regardless of scrolling (synced to .main-view-container via ResizeObserver + resize
//       listener), and fully mounts/unmounts with the lyrics view opening/closing, cleaning up all
//       observers, timeouts, and state each time.
//       Added a persistent, cross-session, cross-language translation cache (GM_setValue/GM_getValue),
//       so re-opening a song/language you've already translated loads instantly with no network call.
//       Count-based LRU eviction; viewable and clearable via new Tampermonkey menu commands ("Cigi:
//       Show Translation Cache" / "Cigi: Clear Translation Cache").
//       Added two small fade-in icons next to the Translate button as visual feedback: one for a
//       fresh translation just saved to the cache, one for a translation loaded from the cache.
//       Both share a single positioning slot so they render in the exact same spot.
//       Added a toggleable "Debug Logging (Console)" option in the Tampermonkey menu for optional
//       verbose console output - off by default, no page reload required to toggle.

(function () {
    'use strict';

    const DEFAULT_LANGUAGE = 'en';
    let isTranslating = false;
    let headerElement = null;
    let headerSpacerElement = null;
    let headerResizeObserver = null;
    let newlyCachedIconElement = null;
    let newlyCachedIconHideTimeout = null;
    let cacheHitIconElement = null;
    let cacheHitIconHideTimeout = null;

    // ---- Debug logging (toggle via Tampermonkey menu, off by default) ----
    let debugEnabled = GM_getValue('cigiDebugLogging', false);
    let debugMenuId = null;

    function dbgLog(msg, ...extra) {
        if (!debugEnabled) return;
        console.log(`%c[Cigi Translator] ${msg}`, 'color:#1db954;font-weight:bold;', ...extra);
    }

    function registerDebugMenu() {
        const label = (debugEnabled ? '✅' : '❌') + ' Debug Logging (Console)';
        debugMenuId = GM_registerMenuCommand(label, toggleDebugLogging);
    }

    function toggleDebugLogging() {
        debugEnabled = !debugEnabled;
        GM_setValue('cigiDebugLogging', debugEnabled);
        console.log(`[Cigi Translator] Debug logging ${debugEnabled ? 'enabled' : 'disabled'}`);
        if (debugMenuId !== null) {
            GM_unregisterMenuCommand(debugMenuId);
        }
        registerDebugMenu();
    }

    registerDebugMenu();

    const languages = {
        // Popular languages
        en: 'English',
        es: 'Spanish',
        fr: 'French',
        de: 'German',
        it: 'Italian',
        pt: 'Portuguese',
        ru: 'Russian',
        ja: 'Japanese',
        ko: 'Korean',
        zh: 'Chinese',
        ar: 'Arabic',
        hi: 'Hindi',
        tr: 'Turkish',

        // Rest in alphabetical order
        af: 'Afrikaans',
        sq: 'Albanian',
        am: 'Amharic',
        hy: 'Armenian',
        az: 'Azerbaijani',
        eu: 'Basque',
        be: 'Belarusian',
        bn: 'Bengali',
        bs: 'Bosnian',
        bg: 'Bulgarian',
        ca: 'Catalan',
        ceb: 'Cebuano',
        co: 'Corsican',
        hr: 'Croatian',
        cs: 'Czech',
        da: 'Danish',
        nl: 'Dutch',
        eo: 'Esperanto',
        et: 'Estonian',
        fi: 'Finnish',
        fy: 'Frisian',
        gl: 'Galician',
        ka: 'Georgian',
        el: 'Greek',
        gu: 'Gujarati',
        ht: 'Haitian Creole',
        ha: 'Hausa',
        haw: 'Hawaiian',
        he: 'Hebrew',
        hmn: 'Hmong',
        hu: 'Hungarian',
        is: 'Icelandic',
        ig: 'Igbo',
        id: 'Indonesian',
        ga: 'Irish',
        jv: 'Javanese',
        kn: 'Kannada',
        kk: 'Kazakh',
        km: 'Khmer',
        rw: 'Kinyarwanda',
        ku: 'Kurdish',
        ky: 'Kyrgyz',
        lo: 'Lao',
        la: 'Latin',
        lv: 'Latvian',
        lt: 'Lithuanian',
        lb: 'Luxembourgish',
        mk: 'Macedonian',
        mg: 'Malagasy',
        ms: 'Malay',
        ml: 'Malayalam',
        mt: 'Maltese',
        mi: 'Maori',
        mr: 'Marathi',
        mn: 'Mongolian',
        my: 'Myanmar (Burmese)',
        ne: 'Nepali',
        no: 'Norwegian',
        ny: 'Nyanja (Chichewa)',
        or: 'Odia (Oriya)',
        ps: 'Pashto',
        fa: 'Persian',
        pl: 'Polish',
        pa: 'Punjabi',
        ro: 'Romanian',
        sm: 'Samoan',
        gd: 'Scots Gaelic',
        sr: 'Serbian',
        st: 'Sesotho',
        sn: 'Shona',
        sd: 'Sindhi',
        si: 'Sinhala',
        sk: 'Slovak',
        sl: 'Slovenian',
        so: 'Somali',
        su: 'Sundanese',
        sw: 'Swahili',
        sv: 'Swedish',
        tl: 'Tagalog (Filipino)',
        tg: 'Tajik',
        ta: 'Tamil',
        tt: 'Tatar',
        te: 'Telugu',
        th: 'Thai',
        tk: 'Turkmen',
        uk: 'Ukrainian',
        ur: 'Urdu',
        ug: 'Uyghur',
        uz: 'Uzbek',
        vi: 'Vietnamese',
        cy: 'Welsh',
        xh: 'Xhosa',
        yi: 'Yiddish',
        yo: 'Yoruba',
        zu: 'Zulu'
    };

    function getSavedLanguage() {
        const lang = localStorage.getItem('spotifyLyricsTranslationLang') || DEFAULT_LANGUAGE;
        dbgLog(`getSavedLanguage() -> "${lang}"`);
        return lang;
    }

    function saveLanguage(lang) {
        dbgLog(`saveLanguage() saving "${lang}"`);
        localStorage.setItem('spotifyLyricsTranslationLang', lang);
    }

    async function translateText(text, targetLang) {
        dbgLog(`translateText() requesting translation to "${targetLang}" for: "${text}"`);
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            const result = data[0][0][0];
            dbgLog(`translateText() result: "${result}"`);
            return result;
        } catch (error) {
            console.error('Translation failed:', error);
            dbgLog('translateText() failed', error);
            return '[Translation Error]';
        }
    }

    // Generation counter: each translateLyrics() run gets a ticket number.
    // If a newer run starts before an older one's network requests resolve,
    // the older run's results are discarded on arrival instead of being written to the DOM.
    let translateGeneration = 0;
    let translatingForLang = null;

    // Repair mechanism: Spotify's lyrics view is React-owned. When a line's
    // synced-highlight state changes (playback reaching it, or the user clicking
    // to seek), React re-renders that line's children and wipes our foreign
    // data-translated div, even though nothing about the translation itself changed.
    // We cache original-text -> translated-text pairs from the last successful run
    // and, if Spotify wipes a line, reinsert its translation from that cache.
    // This is a pure DOM patch: no translateText() calls, no network requests.
    let lineTranslationCache = new Map();
    let repairObserver = null;

    function disconnectRepairObserver() {
        if (repairObserver) {
            repairObserver.disconnect();
            repairObserver = null;
            dbgLog('disconnectRepairObserver() repair observer disconnected');
        }
    }

    function repairMissingTranslations() {
        const lines = document.querySelectorAll('[data-testid="lyrics-line"]');
        let repaired = 0;
        lines.forEach(line => {
            if (line.querySelector('[data-translated="true"]')) return;
            const textDiv = Array.from(line.children).find(child => !child.hasAttribute('data-translated'));
            if (!textDiv) return;
            const originalText = textDiv.textContent.trim();
            const cachedTranslation = lineTranslationCache.get(originalText);
            if (!cachedTranslation) return;
            const translationDiv = document.createElement('div');
            translationDiv.style.color = 'gray';
            translationDiv.style.fontStyle = 'italic';
            translationDiv.textContent = cachedTranslation;
            translationDiv.setAttribute('data-translated', 'true');
            textDiv.parentNode.insertBefore(translationDiv, textDiv.nextSibling);
            repaired++;
        });
        if (repaired > 0) {
            dbgLog(`repairMissingTranslations() Spotify re-render wiped ${repaired} line(s), reinserted from cache (no network calls)`);
        }
    }

    function attachRepairObserver() {
        disconnectRepairObserver();
        const anyLine = document.querySelector('[data-testid="lyrics-line"]');
        if (!anyLine || !anyLine.parentNode) {
            dbgLog('attachRepairObserver() no lyrics-line parent found, repair observer NOT attached');
            return;
        }
        repairObserver = new MutationObserver(repairMissingTranslations);
        repairObserver.observe(anyLine.parentNode, { childList: true, subtree: true });
        dbgLog('attachRepairObserver() watching for Spotify re-renders that wipe translations (repair only, no network calls)');
    }

    // ---- Song identity: prefer the real Spotify trackId, fall back to title-artist ----
    // Same anchor selector Web Lyrics+ uses. Confirmed present (this session's live-DOM
    // check) while lyrics are open for a regular playing track; not separately re-verified
    // for playlist/album/search/radio contexts - the title-artist fallback below covers
    // those if the anchor ever turns out to be missing there.
    function getCurrentTrackId() {
        const anchor = document.querySelector('a[data-testid="context-link"][data-context-item-type="track"][href*="uri=spotify%3Atrack%3A"]');
        if (!anchor) return null;
        const href = decodeURIComponent(anchor.getAttribute('href') || '');
        const match = href.match(/spotify:track:([a-zA-Z0-9]{22})/);
        return match ? match[1] : null;
    }

    function getCurrentTrackLabel() {
        const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
        const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        const artist = artistEl ? artistEl.textContent.trim() : '';
        if (title && artist) return `${title} — ${artist}`;
        return title || artist || 'Unknown track';
    }

    function getCurrentSongIdentity() {
        const trackId = getCurrentTrackId();
        if (trackId) {
            dbgLog(`getCurrentSongIdentity() resolved trackId "${trackId}"`);
            return { id: trackId, label: getCurrentTrackLabel() };
        }
        const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
        const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        const artist = artistEl ? artistEl.textContent.trim() : '';
        if (!title && !artist) {
            dbgLog('getCurrentSongIdentity() no trackId and no title/artist found, cache lookup will be skipped');
            return { id: null, label: null };
        }
        const fallbackId = `${title}-${artist}`;
        dbgLog(`getCurrentSongIdentity() no trackId anchor found, falling back to title-artist id "${fallbackId}"`);
        return { id: fallbackId, label: getCurrentTrackLabel() };
    }

    // ---- Persistent translation cache (cross-session, cross-language) ----
    // Distinct from lineTranslationCache above: that one is session-only, per-run, and
    // exists purely to feed the repair observer. This one survives page reloads and is
    // keyed per song+language so switching back to a previously-used language for the
    // same song can resolve instantly with zero network calls.
    const CIGI_CACHE_STORAGE_KEY = 'cigiTranslationCache_v1';
    const CIGI_CACHE_COUNT_LIMIT = 300; // generous safety net; eviction is count-based, not byte-based

    const PersistentCache = {
        getAll() {
            try {
                return JSON.parse(GM_getValue(CIGI_CACHE_STORAGE_KEY, '{}'));
            } catch (e) {
                console.warn('[Cigi Translator] PersistentCache.getAll() failed to parse stored cache, resetting', e);
                return {};
            }
        },
        saveAll(cache) {
            try {
                GM_setValue(CIGI_CACHE_STORAGE_KEY, JSON.stringify(cache));
            } catch (e) {
                console.warn('[Cigi Translator] PersistentCache.saveAll() failed to write, translation still rendered but not cached', e);
            }
        },
        get(trackId, lang) {
            const key = `${trackId}::${lang}`;
            const cache = this.getAll();
            const entry = cache[key];
            if (!entry) {
                console.log(`[Cigi Translator] No cached translation for "${key}"`);
                dbgLog(`PersistentCache.get() miss for key "${key}"`);
                return null;
            }
            console.log(`[Cigi Translator] Loaded translation from cache: "${entry.trackLabel}" (${lang})`);
            dbgLog(`PersistentCache.get() hit for key "${key}", ${entry.lines.length} lines, last cached ${new Date(entry.timestamp).toISOString()}`);
            entry.timestamp = Date.now(); // LRU touch
            cache[key] = entry;
            this.saveAll(cache);
            return entry;
        },
        set(trackId, lang, trackLabel, lines) {
            const key = `${trackId}::${lang}`;
            const cache = this.getAll();
            const isNewEntry = !cache[key];
            cache[key] = { trackId, lang, trackLabel, lines, timestamp: Date.now() };
            this.evictIfNeeded(cache);
            this.saveAll(cache);
            if (isNewEntry) {
                dbgLog(`PersistentCache.set() new entry cached for "${trackLabel}" (${lang}), key "${key}", ${lines.length} lines`);
            } else {
                dbgLog(`PersistentCache.set() existing entry overwritten for key "${key}", ${lines.length} lines`);
            }
        },
        evictIfNeeded(cache) {
            const keys = Object.keys(cache);
            if (keys.length <= CIGI_CACHE_COUNT_LIMIT) return;
            const oldestFirst = keys
                .map(key => ({ key, timestamp: cache[key].timestamp || 0 }))
                .sort((a, b) => a.timestamp - b.timestamp);
            const excess = oldestFirst.length - CIGI_CACHE_COUNT_LIMIT;
            for (let i = 0; i < excess; i++) {
                delete cache[oldestFirst[i].key];
            }
            dbgLog(`PersistentCache.evictIfNeeded() evicted ${excess} oldest entr${excess === 1 ? 'y' : 'ies'} (count limit ${CIGI_CACHE_COUNT_LIMIT})`);
        },
        clear() {
            try {
                GM_setValue(CIGI_CACHE_STORAGE_KEY, '{}');
            } catch (e) {
                console.warn('[Cigi Translator] PersistentCache.clear() failed', e);
            }
        },
        getStats() {
            const cache = this.getAll();
            const entries = Object.values(cache).map(entry => {
                const sizeBytes = new Blob([JSON.stringify(entry)]).size;
                return {
                    trackLabel: entry.trackLabel,
                    lang: entry.lang,
                    lineCount: entry.lines.length,
                    sizeKB: (sizeBytes / 1024).toFixed(2),
                    cached: new Date(entry.timestamp).toISOString()
                };
            });
            const totalKB = (entries.reduce((sum, e) => sum + parseFloat(e.sizeKB), 0)).toFixed(2);
            return { count: entries.length, totalKB, entries };
        }
    };

    function showTranslationCache() {
        const stats = PersistentCache.getStats();
        console.log(`[Cigi Translator] Translation cache: ${stats.count} entries, ${stats.totalKB} KB`);
        const rows = {};
        stats.entries.forEach((e, i) => {
            rows[i + 1] = {
                Track: e.trackLabel,
                Language: e.lang,
                Lines: e.lineCount,
                'Size (KB)': e.sizeKB,
                Cached: e.cached
            };
        });
        console.table(rows);
        alert('Cigi Translator: cache logged to console. Open DevTools to view.');
    }

    function clearTranslationCache() {
        const stats = PersistentCache.getStats();
        const confirmed = confirm(`Clear Cigi translation cache? Currently ${stats.count} entries, ${stats.totalKB} KB.`);
        if (!confirmed) return;
        PersistentCache.clear();
        alert('Cigi Translator: translation cache cleared.');
    }

    GM_registerMenuCommand('Cigi: Show Translation Cache', showTranslationCache);
    GM_registerMenuCommand('Cigi: Clear Translation Cache', clearTranslationCache);

    function showNewlyCachedIcon() {
        if (!newlyCachedIconElement) return;
        if (newlyCachedIconHideTimeout) {
            clearTimeout(newlyCachedIconHideTimeout);
            newlyCachedIconHideTimeout = null;
        }
        newlyCachedIconElement.style.opacity = '1';
        newlyCachedIconHideTimeout = setTimeout(() => {
            if (newlyCachedIconElement) newlyCachedIconElement.style.opacity = '0';
            newlyCachedIconHideTimeout = null;
        }, 2000);
        dbgLog('showNewlyCachedIcon() displayed newly-cached icon, fading after 2s');
    }

    function showCacheHitIcon() {
        if (!cacheHitIconElement) return;
        if (cacheHitIconHideTimeout) {
            clearTimeout(cacheHitIconHideTimeout);
            cacheHitIconHideTimeout = null;
        }
        cacheHitIconElement.style.opacity = '1';
        cacheHitIconHideTimeout = setTimeout(() => {
            if (cacheHitIconElement) cacheHitIconElement.style.opacity = '0';
            cacheHitIconHideTimeout = null;
        }, 2000);
        dbgLog('showCacheHitIcon() displayed cache-hit icon, fading after 2s');
    }

    async function translateLyrics() {
        const targetLang = getSavedLanguage();
        const myGeneration = ++translateGeneration;
        isTranslating = true;
        translatingForLang = targetLang;
        disconnectRepairObserver(); // old cache/observer belong to the previous run, no longer valid
        dbgLog(`translateLyrics() started (gen ${myGeneration}, lang "${targetLang}")`);

        const lyricsDivs = document.querySelectorAll('[data-testid="lyrics-line"] div');
        dbgLog(`translateLyrics() found ${lyricsDivs.length} candidate lyric divs, target lang "${targetLang}"`);

        const originalLines = [];
        lyricsDivs.forEach((div, index) => {
            const originalText = div.textContent.trim();
            if (originalText && originalText !== "♪") {
                originalLines.push({ index, text: originalText });
            }
        });
        dbgLog(`translateLyrics() ${originalLines.length} lines queued for translation`);

        const identity = getCurrentSongIdentity();
        const cachedEntry = identity.id ? PersistentCache.get(identity.id, targetLang) : null;

        if (cachedEntry) {
            if (myGeneration !== translateGeneration) {
                dbgLog(`translateLyrics() gen ${myGeneration} superseded before cache-hit render, discarding`);
                return;
            }
            const translationByOriginal = new Map(cachedEntry.lines.map(pair => [pair.original, pair.translated]));
            lineTranslationCache = new Map();
            let inserted = 0;
            originalLines.forEach(({ index }) => {
                const targetDiv = lyricsDivs[index];
                const originalText = targetDiv.textContent.trim();
                const translatedText = translationByOriginal.get(originalText);
                if (translatedText === undefined) return;
                const translationDiv = document.createElement('div');
                translationDiv.style.color = 'gray';
                translationDiv.style.fontStyle = 'italic';
                translationDiv.textContent = translatedText;
                translationDiv.setAttribute('data-translated', 'true');
                targetDiv.parentNode.insertBefore(translationDiv, targetDiv.nextSibling);
                lineTranslationCache.set(originalText, translatedText);
                inserted++;
            });
            isTranslating = false;
            translatingForLang = null;
            dbgLog(`translateLyrics() finished from cache (gen ${myGeneration}), inserted ${inserted} translation lines`);
            showCacheHitIcon();
            attachRepairObserver();
            return;
        }

        const translatedLines = await Promise.all(originalLines.map(async (line) => {
            const translatedText = await translateText(line.text, targetLang);
            return { index: line.index, translatedText };
        }));

        if (myGeneration !== translateGeneration) {
            dbgLog(`translateLyrics() gen ${myGeneration} superseded by gen ${translateGeneration}, discarding results`);
            return;
        }

        lineTranslationCache = new Map();
        translatedLines.forEach(({ index, translatedText }, i) => {
            const targetDiv = lyricsDivs[index];
            const translationDiv = document.createElement('div');
            translationDiv.style.color = 'gray';
            translationDiv.style.fontStyle = 'italic';
            translationDiv.textContent = translatedText;
            translationDiv.setAttribute('data-translated', 'true');
            targetDiv.parentNode.insertBefore(translationDiv, targetDiv.nextSibling);
            lineTranslationCache.set(originalLines[i].text, translatedText);
        });

        if (identity.id && translatedLines.length > 0) {
            const pairs = originalLines.map((line, i) => ({ original: line.text, translated: translatedLines[i].translatedText }));
            PersistentCache.set(identity.id, targetLang, identity.label, pairs);
            showNewlyCachedIcon();
        }

        isTranslating = false;
        translatingForLang = null;
        dbgLog(`translateLyrics() finished (gen ${myGeneration}), inserted ${translatedLines.length} translation lines`);
        attachRepairObserver();
    }

    function createHeader() {
        dbgLog('createHeader() building UI');
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 12px 0;
            background: rgba(40, 40, 40, 0.95);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            margin: 0;
            position: fixed;
            z-index: 9999;
        `;

        const controlsContainer = document.createElement('div');
        controlsContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            max-width: 600px;
            width: 90%;
        `;

        const selectContainer = document.createElement('div');
        selectContainer.style.cssText = `
            position: relative;
            flex: 0 1 200px;
            min-width: 120px;
        `;

        const selectButton = document.createElement('button');
        selectButton.style.cssText = `
            width: 100%;
            padding: 8px;
            border: none;
            border-radius: 4px;
            background: rgba(80, 80, 80, 1);
            color: white;
            font-size: 14px;
            text-align: left;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        selectButton.textContent = languages[getSavedLanguage()];

        const dropdown = document.createElement('div');
        dropdown.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(40, 40, 40, 0.98);
            border-radius: 4px;
            margin-top: 4px;
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        const searchInput = document.createElement('input');
        searchInput.style.cssText = `
            width: calc(100% - 16px);
            margin: 8px;
            padding: 8px;
            border: none;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            font-size: 14px;
        `;
        searchInput.placeholder = 'Search language...';

        const optionsContainer = document.createElement('div');
        optionsContainer.style.cssText = `
            padding: 8px 0;
        `;

        function createLanguageOptions(filter = '') {
            optionsContainer.innerHTML = '';

            // Separate popular and other languages
            const popularLanguages = [
                'en', 'tr', 'pl', 'es', 'fr', 'de', 'pt',
                'ja', 'it', 'nl'
            ];

            const entries = Object.entries(languages);
            const filteredEntries = entries.filter(([_, name]) =>
                name.toLowerCase().includes(filter.toLowerCase())
            );

            // Separate and sort entries
            const popularEntries = filteredEntries.filter(([code]) =>
                popularLanguages.includes(code)
            ).sort((a, b) =>
                popularLanguages.indexOf(a[0]) - popularLanguages.indexOf(b[0])
            );

            const otherEntries = filteredEntries.filter(([code]) =>
                !popularLanguages.includes(code)
            );

            // Create divider if both sections have items
            if (popularEntries.length > 0 && otherEntries.length > 0) {
                const divider = document.createElement('div');
                divider.style.cssText = `
                    padding: 8px 16px;
                    color: #888;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                `;
                divider.textContent = 'Other Languages';

                // Create and append all options
                [...popularEntries, divider, ...otherEntries].forEach(entry => {
                    if (entry instanceof HTMLElement) {
                        optionsContainer.appendChild(entry);
                        return;
                    }

                    const [code, name] = entry;
                    const option = document.createElement('div');
                    option.style.cssText = `
                        padding: 8px 16px;
                        cursor: pointer;
                        color: white;
                        &:hover {
                            background: rgba(255, 255, 255, 0.1);
                        }
                    `;
                    option.textContent = name;
                    option.addEventListener('click', () => {
                        dbgLog(`language option clicked: "${name}" (${code})`);
                        selectButton.textContent = name;
                        dropdown.style.display = 'none';
                        saveLanguage(code);
                    });
                    optionsContainer.appendChild(option);
                });
            }
        }

        selectButton.addEventListener('click', () => {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            dbgLog(`language dropdown ${dropdown.style.display === 'block' ? 'opened' : 'closed'}`);
            if (dropdown.style.display === 'block') {
                searchInput.focus();
            }
        });

        searchInput.addEventListener('input', (e) => {
            dbgLog(`language search filter changed: "${e.target.value}"`);
            createLanguageOptions(e.target.value);
        });

        document.addEventListener('click', (e) => {
            if (!selectContainer.contains(e.target)) {
                if (dropdown.style.display !== 'none') {
                    dbgLog('outside click detected, closing language dropdown');
                }
                dropdown.style.display = 'none';
            }
        });

        createLanguageOptions();
        dropdown.appendChild(searchInput);
        dropdown.appendChild(optionsContainer);
        selectContainer.appendChild(selectButton);
        selectContainer.appendChild(dropdown);

        const translateButton = document.createElement('button');
        translateButton.textContent = 'Translate';
        translateButton.style.cssText = `
            padding: 8px 16px;
            background-color: #1db954;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            min-width: 100px;
        `;

        translateButton.addEventListener('click', () => {
            const targetLang = getSavedLanguage();

            if (isTranslating && translatingForLang === targetLang) {
                dbgLog(`Translate clicked again for same language "${targetLang}" while translating - ignoring, letting current run finish`);
                return;
            }

            if (isTranslating) {
                dbgLog(`Translate clicked with new language "${targetLang}" while translating "${translatingForLang}" - aborting current run, clearing lines, starting new run`);
            } else {
                dbgLog(`Translate clicked, starting fresh run for "${targetLang}"`);
            }

            document.querySelectorAll('[data-translated="true"]').forEach(el => el.remove());
            translateLyrics();
        });

        // Transient icon shown briefly the moment a fresh translation gets stored into the
        // persistent cache (see showNewlyCachedIcon()). Stays in the DOM at all times,
        // opacity-toggled + CSS-transitioned rather than display-toggled, so the fade
        // actually animates instead of popping in/out.
        const cacheIcon = document.createElement('span');
        cacheIcon.setAttribute('data-cigi-newly-cached-icon', 'true');
        cacheIcon.style.cssText = `
            display: inline-flex;
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        cacheIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 5.5C3 4.67 3.67 4 4.5 4H9.5C10.33 4 11 4.67 11 5.5V6.5H18.5C19.33 6.5 20 7.17 20 8V9H3V5.5Z" fill="#D9A679" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M2 9H21L17.5 19H5.5L2 9Z" fill="#F3D9B1" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cx="18" cy="18" r="4.2" fill="#5FC896" stroke="#000" stroke-width="1.2"/>
  <path d="M16.1 18.1L17.3 19.3L19.7 16.8" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        newlyCachedIconElement = cacheIcon;

        // Transient icon shown briefly on an actual cache hit (lyrics pulled from the
        // persistent cache, network skipped entirely - see showCacheHitIcon()). Same size,
        // same opacity/timeout/cleanup logic as the newly-cached icon above, different SVG
        // and a separate element/timeout so the two can't stomp on each other if both fire
        // in quick succession (e.g. rapid language switches).
        // v1.8: rebuilt from closed primitives only (<rect>/<ellipse>) - the old open-path
        // fills auto-closed with stray diagonals, which both glitched the shape and skewed
        // its footprint vs. the folder icon above. Badge circle/checkmark is copy-pasted
        // from that folder icon so the two align identically when swapped in the header.
        const cacheHitIcon = document.createElement('span');
        cacheHitIcon.setAttribute('data-cigi-cache-hit-icon', 'true');
        cacheHitIcon.style.cssText = `
            display: inline-flex;
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        cacheHitIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="6" width="12" height="9" fill="#8ED8EF" stroke="#000" stroke-width="1.2"/>
  <ellipse cx="9" cy="15" rx="6" ry="2" fill="#8ED8EF" stroke="#000" stroke-width="1.2"/>
  <ellipse cx="9" cy="6" rx="6" ry="2" fill="#F3D9B1" stroke="#000" stroke-width="1.2"/>
  <path d="M3 9C3 10.1 5.69 11 9 11C12.31 11 15 10.1 15 9" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round"/>
  <path d="M3 12C3 13.1 5.69 14 9 14C12.31 14 15 13.1 15 12" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round"/>
  <circle cx="18" cy="18" r="4.2" fill="#5FC896" stroke="#000" stroke-width="1.2"/>
  <path d="M16.1 18.1L17.3 19.3L19.7 16.8" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        cacheHitIconElement = cacheHitIcon;

        // Both icons share ONE flex slot (not two adjacent ones) so they render in the
        // exact same position - opacity:0 still reserves layout space, so two separate
        // flex children would sit side-by-side (one `gap` apart) whenever only one was
        // visible. Absolutely positioning both inside this single relatively-positioned
        // wrapper makes them overlap identically instead.
        const iconSlot = document.createElement('span');
        iconSlot.style.cssText = `
            position: relative;
            display: inline-block;
            width: 20px;
            height: 20px;
        `;
        cacheIcon.style.position = 'absolute';
        cacheIcon.style.top = '0';
        cacheIcon.style.left = '0';
        cacheHitIcon.style.position = 'absolute';
        cacheHitIcon.style.top = '0';
        cacheHitIcon.style.left = '0';
        iconSlot.appendChild(cacheIcon);
        iconSlot.appendChild(cacheHitIcon);

        controlsContainer.appendChild(selectContainer);
        controlsContainer.appendChild(translateButton);
        controlsContainer.appendChild(iconSlot);
        header.appendChild(controlsContainer);

        const mainView = document.querySelector('.main-view-container__scroll-node-child');
        if (!mainView) {
            dbgLog('createHeader() main view container not found, header NOT mounted');
            return;
        }

        // Appended to body (not into the scroll node) so position:fixed isn't affected by
        // any transform OverlayScrollbars applies to an ancestor - see 1.5 changelog note.
        document.body.appendChild(header);
        headerElement = header;

        // In-flow spacer reserves the vertical space the header used to occupy when it was
        // a normal child, so lyric lines don't render underneath the now out-of-flow header.
        const spacer = document.createElement('div');
        spacer.setAttribute('data-cigi-header-spacer', 'true');
        mainView.insertBefore(spacer, mainView.firstChild);
        headerSpacerElement = spacer;

        positionHeader();

        const mainViewContainer = document.querySelector('.main-view-container');
        if (mainViewContainer) {
            headerResizeObserver = new ResizeObserver(() => positionHeader());
            headerResizeObserver.observe(mainViewContainer);
        }
        window.addEventListener('resize', positionHeader);

        dbgLog('createHeader() header mounted (fixed, rect-synced to .main-view-container)');
    }

    // Keeps the fixed-position header aligned with .main-view-container's current box
    // (left/top/width) and keeps the spacer's height matched to the header's rendered height.
    function positionHeader() {
        if (!headerElement) return;
        const mainViewContainer = document.querySelector('.main-view-container');
        if (!mainViewContainer) {
            dbgLog('positionHeader() .main-view-container not found, skipping');
            return;
        }
        const rect = mainViewContainer.getBoundingClientRect();
        headerElement.style.left = `${rect.left}px`;
        headerElement.style.top = `${rect.top}px`;
        headerElement.style.width = `${rect.width}px`;
        if (headerSpacerElement) {
            headerSpacerElement.style.height = `${headerElement.offsetHeight}px`;
        }
        dbgLog(`positionHeader() left=${Math.round(rect.left)} top=${Math.round(rect.top)} width=${Math.round(rect.width)}`);
    }

    function removeHeader() {
        if (headerElement) {
            headerElement.remove();
            headerElement = null;
            dbgLog('removeHeader() header removed from DOM');
        }
        if (headerSpacerElement) {
            headerSpacerElement.remove();
            headerSpacerElement = null;
        }
        if (headerResizeObserver) {
            headerResizeObserver.disconnect();
            headerResizeObserver = null;
            dbgLog('removeHeader() header resize observer disconnected');
        }
        window.removeEventListener('resize', positionHeader);
        if (newlyCachedIconHideTimeout) {
            clearTimeout(newlyCachedIconHideTimeout);
            newlyCachedIconHideTimeout = null;
        }
        newlyCachedIconElement = null; // was a child of headerElement, already removed above
        if (cacheHitIconHideTimeout) {
            clearTimeout(cacheHitIconHideTimeout);
            cacheHitIconHideTimeout = null;
        }
        cacheHitIconElement = null; // was a child of headerElement, already removed above
        // A translation may still be in-flight against lyric lines Spotify is about to
        // tear down. Bump the generation so its results get discarded on arrival instead
        // of being written into now-detached nodes (which would throw on parentNode.insertBefore).
        translateGeneration++;
        isTranslating = false;
        translatingForLang = null;
        lineTranslationCache = new Map();
        disconnectRepairObserver();
    }

    function watchLyricsPresence() {
        const lyricsPresent = !!document.querySelector('[data-testid="lyrics-line"]');

        if (lyricsPresent && !headerElement) {
            dbgLog('watchLyricsPresence() lyrics container opened, mounting header (no auto-translate)');
            createHeader();
        } else if (!lyricsPresent && headerElement) {
            dbgLog('watchLyricsPresence() lyrics container closed, unmounting header');
            removeHeader();
        }

        setTimeout(watchLyricsPresence, 1000);
    }

    window.addEventListener('load', function () {
        dbgLog('window load event fired, starting script');
        watchLyricsPresence();
    });
})();
