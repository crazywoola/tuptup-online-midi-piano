# Third-party sample credits

TupTup Studio loads the Chinese instrument suite from openly licensed sample
sources. The application code remains MIT-licensed; the audio recordings retain
the licenses listed below.

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

Instrument mappings:

| TupTup patch | FluidR3 sample program |
| --- | --- |
| 流光古筝 | Koto |
| 飞花琵琶 | Shamisen |
| 清风竹笛 | Flute |
| 星河扬琴 | Dulcimer |
| 赤焰唢呐 | Shanai |
| 云岫笙 | Reed Organ |
| 醒狮锣鼓 | Taiko Drum |

These mappings are playable approximations built from sampled acoustic
instruments. They are not presented as archival recordings of every named
Chinese instrument.
