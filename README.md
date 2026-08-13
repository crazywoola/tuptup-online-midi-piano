# TupTup Studio — Online MIDI Workstation

[![CI](https://github.com/crazywoola/tuptup-online-midi-piano/actions/workflows/ci.yml/badge.svg)](https://github.com/crazywoola/tuptup-online-midi-piano/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-d7ff3f.svg)](LICENSE)

A browser-based multitrack MIDI workstation for USB MIDI controllers, built
for the **TupTup TS01-MIDI** and its **SAM5704** sound-module input.

![TupTup Studio preview](public/og-studio.png)

## Features

- Stable single-page DAW layout with arrangement, piano roll, mixer, and shared keyboard
- Web MIDI input with automatic discovery of every available input port
- Explicit support for the TS01's split `TupTup TS01-MIDI` and `SAM5704` ports
- Nine velocity-sensitive Web Audio instruments across multitrack sessions
- Tempo, metronome, loop transport, recording, playback, mute, solo, and arm
- Piano-roll note drawing, selection, duplication, quantize, humanize, and deletion
- MIDI file import/export plus local project save and JSON project export
- Live Note On/Off visualization across a stable 61-key shared piano
- Sustain pedal support through MIDI CC 64
- Mouse, touch, and computer-keyboard fallback controls
- Responsive drawers, dialogs, keyboard shortcuts, and reduced-motion support

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
| `npm test` | Build and run the rendered-page tests |

## Architecture

- React 19 and TypeScript for the workstation interface and sequencer state
- Web MIDI API for hardware input
- Web Audio API for low-latency multitimbral synthesis and metronome playback
- vinext and Cloudflare Workers for the application runtime
- CSS for the responsive piano and performance feedback

MIDI events and audio stay in the browser. The app does not upload performance
data or require an account.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
before submitting a change. Please report security concerns according to
[SECURITY.md](SECURITY.md).

## License

Released under the [MIT License](LICENSE).
