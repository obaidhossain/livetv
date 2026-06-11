# Live TV

A web app for browsing and streaming IPTV channels from M3U playlists. Built with Vite, vanilla JS, and TailwindCSS.

## Features

- **M3U playlist support** — parse and display channels from any M3U URL
- **Live stream probing** — automatically checks each channel's stream with a hidden `<video>` element and marks it green (live) or red (unreachable)
- **Category groups** — channels organized by `group-title` with collapsible headers
- **Search & filter** — filter by channel name/category, toggle to show only live channels
- **HLS playback** — uses HLS.js for m3u8 streams, falls back to native `<video>` for direct streams
- **Dark theme** — full TailwindCSS dark UI, no raw CSS

## Quick Start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (default `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

Produces an optimized build in `dist/`.

## Configuration

Edit `M3U_URL` in `src/main.js` to point to your playlist:

```js
const M3U_URL = 'https://example.com/playlist.m3u'
```

## Architecture

```
src/
  main.js        — App logic: fetch, parse, filter, probe, playback
  m3u-parser.js  — M3U playlist parser
  style.css      — TailwindCSS imports
index.html       — Layout: sidebar + player
```

- Streams are probed via hidden `<video>` elements (3 concurrent, 10s timeout)
- Probe results are cached per URL to avoid re-checking
- HLS.js probes verify the manifest parses (`MANIFEST_PARSED`) before marking live
- Playback results also update probe cache for accuracy
