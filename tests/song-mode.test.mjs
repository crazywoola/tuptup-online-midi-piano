import assert from "node:assert/strict";
import test from "node:test";
import { importTypescriptModule } from "../scripts/import-typescript-module.mjs";

const projectLib = await importTypescriptModule(new URL("../lib/project.ts", import.meta.url));
const sequencer = await importTypescriptModule(new URL("../lib/sequencer.ts", import.meta.url));
const midi = await importTypescriptModule(new URL("../lib/midi.ts", import.meta.url));
const lruLib = await importTypescriptModule(new URL("../lib/audio-buffer-lru.ts", import.meta.url));
const soundfont = await importTypescriptModule(new URL("../lib/soundfont.ts", import.meta.url));

const PROGRAMS = soundfont.INSTRUMENT_IDS.map((id, index) => ({ id, program: id === "drums" ? 118 : index, color: `hsl(${index * 20} 70% 60%)`, name: id.toUpperCase() }));
const DEFAULTS = Object.fromEntries(PROGRAMS.map((item) => [item.id, { color: item.color, program: item.program, channel: item.id === "drums" ? 9 : undefined, name: item.name }]));

function track(id = "grand", clips = []) {
  const preset = PROGRAMS.find((item) => item.id === id);
  return { id: `track-${id}`, name: preset.name, instrument: id, color: preset.color, program: preset.program, channel: id === "drums" ? 9 : 0, volume: 76, pan: 0, reverb: 18, mute: false, solo: false, arm: true, clips };
}

test("migrates v2 step notes to a v3 two-bar clip without changing musical positions", () => {
  const migrated = projectLib.migrateProjectV2({ version: 2, name: "LEGACY", bpm: 98, tracks: [{ ...track("grand"), clips: undefined, notes: [{ id: "n1", note: 64, start: 5, duration: 3, velocity: 87 }] }] }, DEFAULTS);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.ppq, 480);
  assert.equal(migrated.bpm, 98);
  assert.equal(migrated.tracks[0].clips.length, 1);
  assert.equal(migrated.tracks[0].clips[0].displayLengthTicks, 3840);
  assert.deepEqual(migrated.tracks[0].clips[0].notes[0], { id: "n1", pitch: 64, tick: 600, durationTicks: 360, velocity: 87 });
});

test("generates bounded random ideas and only randomizes targeted notes", () => {
  let nextId = 0;
  const generated = projectLib.generateRandomNotes({
    lengthTicks: 480,
    stepTicks: 120,
    pitches: [60, 64],
    density: .5,
    random: () => .1,
    idFactory: () => `random-${++nextId}`,
  });
  assert.deepEqual(generated.map(({ id, pitch, tick, durationTicks, velocity }) => [id, pitch, tick, durationTicks, velocity]), [
    ["random-1", 60, 0, 120, 76],
    ["random-2", 60, 120, 120, 76],
    ["random-3", 60, 240, 120, 76],
    ["random-4", 60, 360, 120, 76],
  ]);

  const original = [
    { id: "a", pitch: 50, tick: 0, durationTicks: 120, velocity: 40 },
    { id: "b", pitch: 51, tick: 120, durationTicks: 240, velocity: 50 },
  ];
  const randomized = projectLib.randomizeNoteValues(original, new Set(["a"]), [60, 64], () => .99);
  assert.deepEqual(randomized[0], { id: "a", pitch: 64, tick: 0, durationTicks: 120, velocity: 118 });
  assert.equal(randomized[1], original[1]);
});

test("generates several styled sections with changing instrument combinations", () => {
  let state = 17;
  let nextId = 0;
  const random = () => ((state = state * 48271 % 2147483647) - 1) / 2147483646;
  const arrangement = projectLib.generateStyledArrangement({
    defaults: DEFAULTS,
    sectionCount: 5,
    style: "mixed",
    random,
    idFactory: (prefix) => `${prefix}-${++nextId}`,
  });

  assert.equal(arrangement.sections.length, 5);
  assert.equal(arrangement.lengthBars, 32);
  assert.equal(new Set(arrangement.sections.map((section) => section.style)).size, 5);
  assert.ok(new Set(arrangement.sections.map((section) => section.instruments.join(","))).size >= 4);
  assert.ok(arrangement.tracks.length >= 8);

  let expectedStart = 0;
  for (const section of arrangement.sections) {
    assert.equal(section.startTick, expectedStart);
    assert.ok(section.instruments.length >= 2);
    expectedStart += section.lengthTicks;
    for (const instrument of section.instruments) {
      const track = arrangement.tracks.find((candidate) => candidate.instrument === instrument);
      assert.ok(track, `missing ${instrument} track`);
      const clip = track.clips.find((candidate) => candidate.startTick === section.startTick);
      assert.ok(clip, `missing ${instrument} clip for ${section.role}`);
      assert.equal(clip.contentLengthTicks, section.lengthTicks);
      assert.ok(clip.notes.length > 0);
      assert.ok(clip.notes.every((note) => note.tick >= 0 && note.tick + note.durationTicks <= clip.contentLengthTicks));
    }
  }

  const document = projectLib.createEmptyProject(arrangement.tracks, "GENERATED");
  document.bpm = arrangement.bpm;
  document.lengthBars = arrangement.lengthBars;
  document.sections = arrangement.sections;
  const normalized = projectLib.normalizeProjectV3(JSON.parse(JSON.stringify(document)), DEFAULTS);
  assert.deepEqual(normalized.sections, arrangement.sections);
});

test("keeps a chosen style while varying the section instrumentation", () => {
  let nextId = 0;
  const arrangement = projectLib.generateStyledArrangement({
    defaults: DEFAULTS,
    sectionCount: 6,
    style: "guofeng",
    random: () => .25,
    idFactory: (prefix) => `${prefix}-${++nextId}`,
  });
  assert.deepEqual(new Set(arrangement.sections.map((section) => section.style)), new Set(["guofeng"]));
  assert.ok(new Set(arrangement.sections.map((section) => section.instruments.join(","))).size >= 4);
  assert.ok(arrangement.tracks.every((item) => ["guzheng", "erhu", "pipa", "dizi", "chinesePercussion"].includes(item.instrument)));
  assert.ok(arrangement.bpm >= 76 && arrangement.bpm <= 112);
});

test("snaps every straight and triplet grid and extends songs in four-bar blocks", () => {
  assert.equal(projectLib.snapTick(239, "1/8"), 240);
  assert.equal(projectLib.snapTick(151, "1/8T"), 160);
  assert.equal(projectLib.snapTick(83, "1/16T"), 80);
  const project = projectLib.createEmptyProject([track()]);
  assert.equal(projectLib.requiredSongBars(project, projectLib.barTicks(project.timeSignature) * 17), 20);
  assert.deepEqual(projectLib.tickToBarBeat(1920 + 480 + 120, project.timeSignature), { bar: 2, beat: 2, subdivision: 2 });
  project.masterVolume = 0;
  project.tracks[0].volume = 0;
  const normalized = projectLib.normalizeProjectV3(project, DEFAULTS);
  assert.equal(normalized.masterVolume, 0);
  assert.equal(normalized.tracks[0].volume, 0);
});

test("expands looped clips and splits their audible content without folding the song", () => {
  const clip = projectLib.createClip(960, 480, "LOOP", [{ id: "n", pitch: 60, tick: 0, durationTicks: 240, velocity: 100 }]);
  clip.loopEnabled = true;
  clip.displayLengthTicks = 1440;
  assert.deepEqual(projectLib.expandClipNotes(clip).map((note) => note.songTick), [960, 1440, 1920]);
  const parts = projectLib.splitClip(clip, 1440);
  assert.ok(parts);
  assert.equal(parts[0].displayLengthTicks, 480);
  assert.equal(parts[1].startTick, 1440);
  assert.equal(parts[1].notes[0].tick, 0);
});

test("look-ahead windows schedule a ten-minute song exactly once per note", () => {
  const bars = 300;
  const perBar = 1920;
  const notes = Array.from({ length: bars }, (_, index) => ({ id: `n-${index}`, pitch: 60 + index % 12, tick: index * perBar, durationTicks: 240, velocity: 90 }));
  const clip = projectLib.createClip(0, bars * perBar, "TEN MINUTES", notes);
  const project = projectLib.createEmptyProject([track("grand", [clip])]);
  project.lengthBars = bars;
  project.bpm = 120;
  project.loop.enabled = false;
  let cursor = 0;
  const seen = [];
  const windowTicks = sequencer.secondsToTicks(.025, project.bpm);
  while (cursor < projectLib.songEndTick(project)) {
    const next = Math.min(projectLib.songEndTick(project), cursor + windowTicks);
    seen.push(...sequencer.collectPlaybackEvents(project, cursor, next).map((event) => event.tick));
    cursor = next;
  }
  assert.equal(seen.length, bars);
  assert.equal(new Set(seen).size, bars);
  assert.equal(seen.at(-1), (bars - 1) * perBar);
});

test("loop segments, seek, and pause/resume preserve exact transport positions", () => {
  const project = projectLib.createEmptyProject([track()]);
  project.loop = { enabled: true, startTick: 1920, endTick: 3840 };
  const segments = sequencer.scheduleSegments(project, 3800, 120);
  assert.deepEqual(segments.map(({ fromTick, toTick }) => [fromTick, toTick]), [[3800, 3840], [1920, 2000]]);
  assert.equal(sequencer.advanceTransportTick(project, 3800, 120), 2000);
  const paused = 2450;
  assert.equal(sequencer.advanceTransportTick(project, paused, 0), paused);
});

test("MIDI round-trip preserves long songs, overlap, drums, tempo, and meter", () => {
  const longClip = projectLib.createClip(0, 24 * 1920, "LONG", [
    { id: "a", pitch: 60, tick: 0, durationTicks: 960, velocity: 100 },
    { id: "b", pitch: 60, tick: 480, durationTicks: 960, velocity: 80 },
    { id: "c", pitch: 72, tick: 20 * 1920, durationTicks: 1440, velocity: 110 },
  ]);
  const drumClip = projectLib.createClip(0, 24 * 1920, "DRUMS", [{ id: "kick", pitch: 36, tick: 23 * 1920, durationTicks: 120, velocity: 120 }]);
  const source = projectLib.createEmptyProject([track("grand", [longClip]), track("drums", [drumClip])]);
  source.bpm = 137;
  source.timeSignature = { numerator: 7, denominator: 8 };
  source.lengthBars = 32;
  source.loop.enabled = false;
  const parsed = midi.parseMidiFile(midi.makeProjectMidi(source).buffer, PROGRAMS, DEFAULTS);
  assert.equal(parsed.bpm, 137);
  assert.deepEqual(parsed.timeSignature, { numerator: 7, denominator: 8 });
  assert.ok(parsed.lengthBars >= 20);
  assert.equal(parsed.tracks.reduce((count, item) => count + item.clips[0].notes.length, 0), 4);
  assert.ok(parsed.tracks.some((item) => item.channel === 9 && item.clips[0].notes.some((note) => note.pitch === 36)));
  const overlaps = parsed.tracks.flatMap((item) => item.clips[0].notes).filter((note) => note.pitch === 60);
  assert.equal(overlaps.length, 2);
});

test("MIDI parser accepts running status", () => {
  const trackData = [0x00, 0xc0, 0x00, 0x00, 0x90, 60, 100, 0x78, 64, 90, 0x78, 0x80, 60, 0, 0x00, 64, 0, 0x00, 0xff, 0x2f, 0x00];
  const bytes = new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, trackData.length, ...trackData,
  ]);
  const parsed = midi.parseMidiFile(bytes.buffer, PROGRAMS, DEFAULTS);
  assert.deepEqual(parsed.tracks[0].clips[0].notes.map((note) => [note.pitch, note.tick, note.durationTicks]), [[60, 0, 240], [64, 120, 120]]);
});

test("MIDI import splits mixed channels and closes held notes at track end", () => {
  const trackData = [
    0x00, 0x90, 60, 100,
    0x00, 0x99, 36, 120,
    0x78, 0x89, 36, 0,
    0x78, 0xff, 0x2f, 0x00,
  ];
  const bytes = new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, trackData.length, ...trackData,
  ]);
  const parsed = midi.parseMidiFile(bytes.buffer, PROGRAMS, DEFAULTS);
  assert.deepEqual(parsed.tracks.map((item) => item.channel).sort((a, b) => a - b), [0, 9]);
  assert.equal(parsed.tracks.find((item) => item.channel === 0).clips[0].notes[0].durationTicks, 240);
  assert.equal(parsed.tracks.find((item) => item.channel === 9).instrument, "drums");
});

test("96 MB sample LRU evicts old buffers but retains the active instrument", () => {
  const cache = new lruLib.AudioBufferLru(100);
  const buffer = (bytes) => ({ length: bytes / 4, numberOfChannels: 1 });
  cache.set("grand:60", buffer(60));
  cache.retain(["grand:"]);
  cache.set("bass:48", buffer(60));
  assert.ok(cache.get("grand:60"));
  assert.equal(cache.get("bass:48"), undefined);
  assert.deepEqual(cache.takeEvictedKeys(), ["bass:48"]);
});
