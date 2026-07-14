## CIGI SPOTIFY TRANSLATOR (FORK)

> A rewritten fork of Cigi Spotify Translator. Translates lyrics inline inside the stock Spotify Web Player lyrics view, on demand, with results cached so you're not re-translating the same song twice.  
> **Recommended userscript manager:** [Violentmonkey](https://violentmonkey.github.io/)

## Features

> **MANUAL, ON-DEMAND TRANSLATION**  
> Translate only runs when you click it. No background auto-translating, no polling.  
> Handles rapid clicks and language switches cleanly via a generation-counter state machine.
>
> **STABLE DURING PLAYBACK**  
> Translations no longer disappear as the song plays or when you click to seek a lyric line.  
> A repair-only observer reinserts them from cache with zero extra network calls.
>
> **PINNED HEADER**  
> The language selector + Translate bar stays fixed to the top of the screen while scrolling through lyrics, instead of scrolling away.
>
> **PERSISTENT TRANSLATION CACHE**  
> Already translated a song into a language before? Opening it again loads instantly — no network call.  
> Cross-session, cross-language, viewable/clearable from the userscript manager's menu.
>
> **VISUAL FEEDBACK**  
> Small fade-in icons next to the Translate button show whether a translation was just cached or loaded from cache.
>
> **OPTIONAL DEBUG LOGGING**  
> Toggleable console logging for troubleshooting, off by default, no reload needed to switch.

## Installation

> 1. Install a userscript manager: [Violentmonkey](https://violentmonkey.github.io/) (recommended) or [Tampermonkey](https://www.tampermonkey.net/).
> 2. Install the script: [cigi-spotify-translator-fork.user.js](https://raw.githubusercontent.com/Myst1cX/cigi-spotify-translator-fork/main/cigi-spotify-translator-fork.user.js)
> 3. Open the [Spotify Web Player](https://open.spotify.com/), start a song with lyrics, and open the lyrics view.
> 4. Pick a language and press Translate.

* * *

> For feedback or bug reports, open an issue:  
> [https://github.com/Myst1cX/cigi-spotify-translator-fork/issues](https://github.com/Myst1cX/cigi-spotify-translator-fork/issues)

## Credits

> 1. **Forked from** [Cigi Spotify Translator](https://greasyfork.org/en/scripts/523415-cigi-spotify-translator) by Raiwulf.
> 2. **Powered by** [Spotify](https://open.spotify.com/).

## License

> This project is licensed under the [MIT License](https://github.com/Myst1cX/cigi-spotify-translator-fork/blob/main/LICENSE).
