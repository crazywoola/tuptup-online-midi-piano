# TupTup Studio — Online MIDI Workstation

[![CI](https://github.com/crazywoola/tuptup-online-midi-piano/actions/workflows/ci.yml/badge.svg)](https://github.com/crazywoola/tuptup-online-midi-piano/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-d7ff3f.svg)](LICENSE)

A browser-based multitrack MIDI workstation for USB MIDI controllers, built
for the **TupTup TS01-MIDI** and its **SAM5704** sound-module input.

Song Mode v3 replaces the original fixed 32-step loop with a PPQ-480 song
document, multi-clip arrangement, clip-focused Piano Roll, exact Web Audio
scheduling, and long-song MIDI round-tripping. It remains a single-page,
beginner-friendly workstation: the first key press always makes sound, even
while HD samples are still loading.

![TupTup Studio preview](public/og-studio.png)

## Features

- Full Song Mode with a zoomable, horizontally scrollable arrangement and a variable song length
- Multi-clip tracks with move, resize, loop-stretch, duplicate, split, and delete workflows
- Tick-accurate Piano Roll editing with marquee selection, multi-note drag/resize, velocity, quantize strength, triplet grids, and step lengths
- Complete Chinese/English interface with browser-language detection and a persistent header switch
- Web MIDI input with automatic discovery of every available input port
- Explicit support for the TS01's split `TupTup TS01-MIDI` and `SAM5704` ports
- Seventeen sample-backed instruments: 9 studio sounds plus an 8-instrument Chinese suite
- Zero-wait synthesis on the first note, followed by an automatic upgrade to the streamed HD sample
- Safe MIDI.js SoundFont parsing, persistent browser caching, 11-note anchor decoding, and exact-note background decoding
- Per-instrument preview, download/fallback status, retry controls, and an optional 17-instrument Sound Check
- A dismissible four-step first-song coach that keeps the full professional workspace available
- AudioContext look-ahead playback (25 ms checks / 120 ms horizon), one-bar count-in, seek, pause/resume, independent loop range, and overdub recording
- Piano-roll note drawing, selection, duplication, quantize, humanize, and deletion
- Step input from the screen, computer, or MIDI keyboard directly into the piano roll
- Long-song MIDI import/export plus v2/v3 JSON import/export and IndexedDB project recovery
- Real per-track volume, pan, reverb-send buses and a master limiter
- A 96 MB decoded-sample LRU budget while raw SoundFonts remain in Cache Storage
- Live Note On/Off visualization across a stable 61-key shared piano
- Sustain pedal support through MIDI CC 64
- Mouse, touch, and computer-keyboard fallback controls
- Desktop workspace plus focused mobile Arrangement / Roll / Play / Mix tabs, responsive drawers, keyboard shortcuts, and reduced-motion support
- A bilingual feature guide at `/guide` with recording and editing walkthroughs

## Requirements

- Node.js 22.13 or newer for local development
- A desktop Chromium browser with Web MIDI support for USB hardware input
- HTTPS or localhost, because Web MIDI requires a secure browser context

Safari and embedded webviews may not expose Web MIDI. For hardware testing,
use the current desktop version of Chrome or Edge.

## Quick start

```bash
git clone https://github.com/crazywoola/tuptup-online-midi-piano.git
cd tuptup-online-midi-piano
npm ci
npm run dev
```

Open the local URL shown in the terminal, connect the controller over USB,
choose **连接设备**, and approve the browser permission prompt.
Use the **中 / EN** control in the header to switch the whole workstation language.

## Make a first song

1. Choose an instrument from the sound library. Use its **▶** button to preview
   it; playing can begin immediately with the synth fallback.
2. Double-click an empty track lane, or choose the pencil tool and click the
   arrangement, to create a MIDI clip at the current grid.
3. Select the clip to open it in the Piano Roll. Draw notes directly, or enable
   **Step Input** and play the shared 61-key piano, computer keys **A–K**, or a
   connected MIDI keyboard.
4. For live recording, arm the target track with **●**, optionally enable the
   one-bar count-in or loop, then press **R**. Loop recording overdubs each pass.
5. Press **Space** to hear the full song. Drag clips to arrange them, drag their
   edges to trim or loop-stretch, and use the clip toolbar to duplicate, split,
   or delete them.
6. Choose **Save** for local IndexedDB recovery, or **Export** for a standard
   `.mid` file or a complete v3 `.tuptup.json` project bundle.

The bottom keyboard is shared by live play, Step Input, and recording. Selecting
or playing a note changes only color, shadow, and opacity—the keyboard, tracks,
and Piano Roll keep their dimensions.

### Editing model

| Surface | What it edits |
| --- | --- |
| Arrangement | Song-positioned clips: create, select, move, trim, loop-stretch, duplicate, split, and delete |
| Piano Roll | Notes inside the active clip: marquee, move, resize, transpose, nudge, velocity, quantize, and humanize |
| Transport loop | Independent song playback/recording range; it does not rewrite clip content |
| Clip loop | Repeats a clip's `contentLengthTicks` across its longer `displayLengthTicks` |

Available grids are `1/4`, `1/8`, `1/16`, `1/32`, `1/8T`, and `1/16T`.
Projects begin at 16 bars and extend in four-bar blocks whenever recording,
editing, or MIDI import reaches beyond the current ending.

## How the TS01 connection works

The controller exposes two CoreMIDI/Web MIDI inputs:

| Input | Purpose |
| --- | --- |
| `TupTup TS01-MIDI` | Controller interface |
| `SAM5704` | Piano Note On/Off data |

The app opens and listens to all available MIDI inputs. This is intentional:
on the tested TS01 hardware, the physical piano keys send notes from
`SAM5704`, even though the device is marketed as `TupTup TS01-MIDI`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create the production Cloudflare Worker build |
| `npm run lint` | Run ESLint and accessibility checks |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run test:unit` | Test v3 migration, clips, long-song scheduling, MIDI round-trip, sample LRU, and SoundFonts |
| `npm run audit:samples` | Download and validate every remote SoundFont plus the local erhu WAV |
| `npm test` | Create a production build and run the complete rendered-page, Song Mode, MIDI, scheduler, cache, and SoundFont test suite |

## Architecture

- React 19 and TypeScript with a unified `ProjectDocumentV3` reducer/history model at PPQ 480
- Web MIDI API for hardware input
- Web Audio API for exact-time scheduling, multitimbral sample playback, track buses, reverb, limiting, synthesis, and metronome playback
- IndexedDB for current projects and recovery snapshots; v2 local drafts are migrated without deleting the old data
- Versioned Cache Storage for raw FluidR3 SoundFonts; decoded `AudioBuffer` objects use a 96 MB in-memory LRU
- vinext and Cloudflare Workers for the application runtime
- CSS for the responsive piano and performance feedback

### Source map

| Path | Responsibility |
| --- | --- |
| `components/StudioWorkbench.tsx` | Workstation UI, unified project history, gestures, transport, recording, and audio routing |
| `lib/project.ts` | V3 types, v2 migration, tick/grid helpers, clip expansion/splitting, and song extension |
| `lib/sequencer.ts` | Tick/second conversion and look-ahead scheduling windows, including loop boundaries |
| `lib/midi.ts` | Long-song Standard MIDI import/export, running status, channel/program, tempo, meter, and drums |
| `lib/project-store.ts` | IndexedDB current-project and recovery snapshots with a local fallback |
| `lib/soundfont.ts` | Licensed 17-instrument source map, safe parser, cache, anchors, and fallback metadata |
| `lib/audio-buffer-lru.ts` | Approximate 96 MB decoded-sample memory budget |
| `app/guide/page.tsx` | Standalone bilingual user manual at `/guide` |

### Sample loading lifecycle

Every instrument has a deterministic source in `lib/soundfont.ts`. Sixteen use
the browser-ready FluidR3 GM collection, and erhu uses the attributed Berklee
BISA recording in `public/samples/chinese/`.

The first note never waits for the network: TupTup plays its matching synth
fallback and starts the sample request in the background. A FluidR3 file is
normally about 1.7–3 MB. When it arrives, the app decodes 11 anchors across the
61-key performance range and switches later notes to sampled playback. Exact
pitches decode in the background; until then the nearest anchor is
pitch-shifted. Raw responses persist in the versioned `tuptup-soundfonts-v2`
browser cache. Decoded samples share a roughly 96 MB LRU budget that retains
the active and immediately scheduled sounds, and all buffers are released when
the tab closes.

### Song document and MIDI behavior

Song Mode stores musical time as PPQ-480 ticks. Tracks own any number of MIDI
clips; a clip has independent content and display lengths, so a looped clip can
repeat without copying its source notes. Projects start at 16 bars and extend
in four-bar blocks when content moves or imports beyond the current ending.

The local project format is `ProjectDocumentV3`. Saving writes a recovery
snapshot and current document to IndexedDB. Imported v2 `.tuptup.json` files
are migrated into a two-bar clip, and the original browser draft is left in
place until the v3 save succeeds. Standard MIDI import preserves absolute song
length, overlapping notes, channel/program data, drums, tempo, and meter;
export expands looped clips and orders Note Off before same-tick Note On.

| Import | Result |
| --- | --- |
| v2 `.tuptup.json` | Migrated non-destructively into one two-bar v3 clip per legacy track |
| v3 `.tuptup.json` | Restored with clips, notes, instruments, mix, loop, BPM, and meter |
| `.mid` / `.midi` | Imported at absolute length with separate MIDI channels and preserved musical metadata |

Use **Sound Check** beside the sound-library heading to preview, retry, or
explicitly check all 17 instruments. The full check uses roughly 30–45 MB and
is never run automatically. A 15-second timeout, a failed request, or a failed
MP3 decode always leaves the synth fallback playable.

MIDI events and audio stay in the browser. The app does not upload performance
data or require an account.

The complete instrument library uses CC BY audio from Berklee BISA and FluidR3 GM. See
[THIRD_PARTY_SAMPLES.md](THIRD_PARTY_SAMPLES.md) for source links, attribution,
licenses, adaptations, and instrument mappings.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
before submitting a change. Please report security concerns according to
[SECURITY.md](SECURITY.md).

## License

Released under the [MIT License](LICENSE).
