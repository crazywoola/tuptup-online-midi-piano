# Third-party sample credits

TupTup Studio loads all 17 instrument sounds from openly licensed sample
sources. The application code remains MIT-licensed; the audio recordings retain
the licenses listed below. Network samples are requested at runtime and are not
redistributed in this repository.

## Berklee Intersectional Soundbox Archive — Chinese Erhu

- Asset: `public/samples/chinese/erhu-vibrato-a4.wav`
- Original title: **Regular (A4)**, Chinese Erhu One Shots — Vibrato
- Performer: Yu Chun Chan
- Engineer: Josefina Ugarte
- Editor: Asher Deverna
- Source: https://remix.berklee.edu/bisa-chinese-erhu-oneshots-vibrato/7/
- Collection: https://remix.berklee.edu/bisa-chinese-erhu/
- License: Creative Commons Attribution 4.0 International
  (https://creativecommons.org/licenses/by/4.0/)
- Adaptation: the original WAV is decoded in the browser and pitch-shifted in
  real time to follow incoming MIDI notes. The recording itself is otherwise
  unmodified in the repository.

## FluidR3 GM via MIDI.js Soundfonts

TupTup Studio streams and decodes selected note samples on demand from the
FluidR3 GM browser-ready soundfont collection:

- Source project: https://github.com/gleitz/midi-js-soundfonts
- Runtime prefix: https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/
- License: Creative Commons Attribution 3.0
  (https://creativecommons.org/licenses/by/3.0/)
- FluidR3 GM original compilation: Frank Wen
- Browser-ready conversion and hosting: Benjamin Gleitzman and MIDI.js

## Complete instrument mapping

| TupTup patch | Runtime asset | Source and license | Relationship |
| --- | --- | --- | --- |
| 录音室大钢琴 / Studio Grand | `acoustic_grand_piano` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 丝绒电钢 / Velvet Keys | `electric_piano_1` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 极光铺底 / Aurora Pad | `pad_2_warm` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 深潜单声道 / Deep Mono | `synth_bass_1` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 霓虹主音 / Neon Lead | `lead_2_sawtooth` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 月光风琴 / Moon Organ | `drawbar_organ` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 玻璃马林巴 / Glass Marimba | `marimba` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 温暖弦乐群 / Warm Ensemble | `string_ensemble_1` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 脉冲鼓组 / Pulse Kit | `synth_drum` | FluidR3 GM · CC BY 3.0 | Direct GM family |
| 流光古筝 / Guzheng | `koto` | FluidR3 GM · CC BY 3.0 | Playable approximation |
| 烟雨二胡 / Mist Erhu | `erhu-vibrato-a4.wav` | Berklee BISA · CC BY 4.0 | Direct erhu recording, pitch-shifted |
| 飞花琵琶 / Pipa | `shamisen` | FluidR3 GM · CC BY 3.0 | Playable approximation |
| 清风竹笛 / Dizi | `flute` | FluidR3 GM · CC BY 3.0 | Playable approximation |
| 星河扬琴 / Yangqin | `dulcimer` | FluidR3 GM · CC BY 3.0 | Playable approximation |
| 赤焰唢呐 / Suona | `shanai` | FluidR3 GM · CC BY 3.0 | Playable approximation |
| 云岫笙 / Sheng | `reed_organ` | FluidR3 GM · CC BY 3.0 | Playable approximation |
| 醒狮锣鼓 / Chinese Percussion | `taiko_drum` | FluidR3 GM · CC BY 3.0 | Playable approximation |

The Chinese GM mappings are playable timbral approximations, not archival
recordings of every named instrument. The interface and guide label their
source and provide a synth fallback whenever the licensed sample is not ready.

## Runtime handling

- FluidR3 JavaScript wrappers are parsed as data, without `eval`.
- The raw response is persisted in the versioned browser Cache Storage entry
  `tuptup-soundfonts-v2`; decoded buffers remain in memory only.
- Eleven representative pitches are decoded first. Exact requested pitches are
  decoded lazily, with the nearest anchor used in the meantime.
- `npm run audit:samples` validates HTTP availability, all 88 encoded pitches,
  11 anchors, representative MP3 bytes, and the local erhu WAV header.
