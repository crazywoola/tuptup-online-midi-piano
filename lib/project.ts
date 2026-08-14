import { INSTRUMENT_IDS, type InstrumentId } from "./soundfont";

export const PROJECT_VERSION = 3 as const;
export const PPQ = 480;
export const DEFAULT_SONG_BARS = 16;
export const SONG_EXTENSION_BARS = 4;
export const STEP_TICKS = PPQ / 4;

export type TimeSignature = { numerator: number; denominator: 2 | 4 | 8 | 16 };

export type MidiNoteV3 = {
  id: string;
  pitch: number;
  tick: number;
  durationTicks: number;
  velocity: number;
};

export type MidiClipV3 = {
  id: string;
  name: string;
  startTick: number;
  contentLengthTicks: number;
  displayLengthTicks: number;
  loopEnabled: boolean;
  notes: MidiNoteV3[];
};

export type MidiTrackV3 = {
  id: string;
  name: string;
  instrument: InstrumentId;
  color: string;
  program: number;
  channel: number;
  volume: number;
  pan: number;
  reverb: number;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  clips: MidiClipV3[];
};

export const ARRANGEMENT_STYLE_IDS = ["synthwave", "lofi", "cinematic", "guofeng", "funk"] as const;
export type ArrangementStyleId = typeof ARRANGEMENT_STYLE_IDS[number];
export type ArrangementStyleMode = ArrangementStyleId | "mixed";
export type SongSectionRole = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "finale";

export type SongSectionV3 = {
  id: string;
  role: SongSectionRole;
  style: ArrangementStyleId;
  startTick: number;
  lengthTicks: number;
  color: string;
  instruments: InstrumentId[];
};

export type ProjectDocumentV3 = {
  version: typeof PROJECT_VERSION;
  id: string;
  name: string;
  ppq: typeof PPQ;
  bpm: number;
  timeSignature: TimeSignature;
  lengthBars: number;
  masterVolume: number;
  loop: { enabled: boolean; startTick: number; endTick: number };
  sections: SongSectionV3[];
  tracks: MidiTrackV3[];
  updatedAt: number;
};

export type LegacyNoteV2 = { id: string; note: number; start: number; duration: number; velocity: number };
export type LegacyTrackV2 = Omit<MidiTrackV3, "clips" | "program" | "channel"> & { notes: LegacyNoteV2[]; program?: number; channel?: number };
export type LegacyProjectV2 = { version?: 2; name?: string; bpm?: number; masterVolume?: number; tracks?: LegacyTrackV2[] };

export type InstrumentDefaults = Record<InstrumentId, { color: string; program: number; channel?: number; name: string }>;

export const GRID_VALUES = {
  "1/4": PPQ,
  "1/8": PPQ / 2,
  "1/16": PPQ / 4,
  "1/32": PPQ / 8,
  "1/8T": PPQ / 3,
  "1/16T": PPQ / 6,
} as const;

export type GridValue = keyof typeof GRID_VALUES;

export function projectUid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function barTicks(signature: TimeSignature, ppq = PPQ) {
  return Math.round(signature.numerator * ppq * 4 / signature.denominator);
}

export function tickToBarBeat(tick: number, signature: TimeSignature, ppq = PPQ) {
  const perBar = barTicks(signature, ppq);
  const beatTicks = ppq * 4 / signature.denominator;
  const safe = Math.max(0, tick);
  return {
    bar: Math.floor(safe / perBar) + 1,
    beat: Math.floor((safe % perBar) / beatTicks) + 1,
    subdivision: Math.floor(((safe % beatTicks) / beatTicks) * 4) + 1,
  };
}

export function snapTick(tick: number, grid: GridValue | number) {
  const size = typeof grid === "number" ? grid : GRID_VALUES[grid];
  return Math.max(0, Math.round(tick / size) * size);
}

export function clampMidi(value: number) {
  return Math.max(0, Math.min(127, Math.round(value)));
}

export function cloneProject(project: ProjectDocumentV3): ProjectDocumentV3 {
  return {
    ...project,
    timeSignature: { ...project.timeSignature },
    loop: { ...project.loop },
    sections: project.sections.map((section) => ({ ...section, instruments: [...section.instruments] })),
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => ({ ...note })) })),
    })),
  };
}

export function createClip(startTick: number, lengthTicks: number, name = "MIDI CLIP", notes: MidiNoteV3[] = []): MidiClipV3 {
  const safeLength = Math.max(STEP_TICKS, Math.round(lengthTicks));
  return {
    id: projectUid("clip"),
    name,
    startTick: Math.max(0, Math.round(startTick)),
    contentLengthTicks: safeLength,
    displayLengthTicks: safeLength,
    loopEnabled: false,
    notes,
  };
}

export type RandomNoteOptions = {
  lengthTicks: number;
  stepTicks?: number;
  pitches?: readonly number[];
  density?: number;
  random?: () => number;
  idFactory?: () => string;
};

const DEFAULT_RANDOM_PITCHES = [60, 62, 64, 67, 69, 72] as const;

export function generateRandomNotes({
  lengthTicks,
  stepTicks = STEP_TICKS,
  pitches = DEFAULT_RANDOM_PITCHES,
  density = .64,
  random = Math.random,
  idFactory = () => projectUid("random"),
}: RandomNoteOptions): MidiNoteV3[] {
  const safeLength = Math.max(STEP_TICKS, Math.round(lengthTicks));
  const safeStep = Math.max(1, Math.round(stepTicks));
  const playablePitches = pitches.length ? pitches.map(clampMidi) : [...DEFAULT_RANDOM_PITCHES];
  const chance = Math.max(.1, Math.min(1, density));
  const notes: MidiNoteV3[] = [];

  for (let tick = 0; tick < safeLength; tick += safeStep) {
    if (random() > chance) continue;
    const pitch = playablePitches[Math.min(playablePitches.length - 1, Math.floor(random() * playablePitches.length))];
    const durationTicks = Math.min(safeLength - tick, random() > .82 ? safeStep * 2 : safeStep);
    notes.push({ id: idFactory(), pitch, tick, durationTicks, velocity: 72 + Math.floor(random() * 47) });
  }

  if (!notes.length) notes.push({ id: idFactory(), pitch: playablePitches[0], tick: 0, durationTicks: Math.min(safeStep, safeLength), velocity: 96 });
  return notes;
}

export function randomizeNoteValues(
  notes: readonly MidiNoteV3[],
  targetIds: ReadonlySet<string>,
  pitches: readonly number[] = DEFAULT_RANDOM_PITCHES,
  random: () => number = Math.random,
) {
  const playablePitches = pitches.length ? pitches.map(clampMidi) : [...DEFAULT_RANDOM_PITCHES];
  return notes.map((note) => {
    if (!targetIds.has(note.id)) return note;
    const pitch = playablePitches[Math.min(playablePitches.length - 1, Math.floor(random() * playablePitches.length))];
    return { ...note, pitch, velocity: 72 + Math.floor(random() * 47) };
  });
}

type ArrangementStylePreset = {
  color: string;
  bpm: readonly [number, number];
  scale: readonly number[];
  density: number;
  ensemble: readonly InstrumentId[];
};

const ARRANGEMENT_STYLE_PRESETS: Record<ArrangementStyleId, ArrangementStylePreset> = {
  synthwave: { color: "#ff6c8f", bpm: [104, 124], scale: [0, 2, 3, 5, 7, 8, 10], density: .7, ensemble: ["pad", "bass", "drums", "electric", "lead"] },
  lofi: { color: "#63d7ff", bpm: [72, 92], scale: [0, 3, 5, 7, 10], density: .52, ensemble: ["electric", "bass", "drums", "grand", "marimba"] },
  cinematic: { color: "#b69cff", bpm: [80, 108], scale: [0, 2, 3, 5, 7, 8, 11], density: .46, ensemble: ["strings", "pad", "drums", "grand", "marimba"] },
  guofeng: { color: "#e7bd62", bpm: [76, 112], scale: [0, 2, 5, 7, 9], density: .6, ensemble: ["guzheng", "erhu", "chinesePercussion", "pipa", "dizi"] },
  funk: { color: "#9df564", bpm: [102, 124], scale: [0, 2, 3, 5, 7, 9, 10], density: .76, ensemble: ["organ", "bass", "drums", "electric", "lead"] },
};

const SECTION_LAYERS: Record<SongSectionRole, readonly number[]> = {
  intro: [0, 3],
  verse: [0, 1, 2],
  prechorus: [0, 1, 2, 3],
  chorus: [0, 1, 2, 3, 4],
  bridge: [0, 3, 4],
  finale: [0, 1, 2, 3, 4],
};

const SECTION_TEMPLATES: Record<number, ReadonlyArray<{ role: SongSectionRole; bars: number }>> = {
  3: [{ role: "intro", bars: 4 }, { role: "chorus", bars: 8 }, { role: "finale", bars: 8 }],
  4: [{ role: "intro", bars: 4 }, { role: "verse", bars: 8 }, { role: "chorus", bars: 8 }, { role: "finale", bars: 8 }],
  5: [{ role: "intro", bars: 4 }, { role: "verse", bars: 8 }, { role: "chorus", bars: 8 }, { role: "bridge", bars: 4 }, { role: "finale", bars: 8 }],
  6: [{ role: "intro", bars: 4 }, { role: "verse", bars: 8 }, { role: "prechorus", bars: 4 }, { role: "chorus", bars: 8 }, { role: "bridge", bars: 4 }, { role: "finale", bars: 8 }],
};

function randomIndex(random: () => number, length: number) {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

function sectionStyles(mode: ArrangementStyleMode, count: number, random: () => number) {
  if (mode !== "mixed") return Array.from({ length: count }, () => mode);
  const start = randomIndex(random, ARRANGEMENT_STYLE_IDS.length);
  return Array.from({ length: count }, (_, index) => ARRANGEMENT_STYLE_IDS[(start + index) % ARRANGEMENT_STYLE_IDS.length]);
}

function noteRole(instrument: InstrumentId) {
  if (instrument === "drums" || instrument === "chinesePercussion") return "drums" as const;
  if (instrument === "bass") return "bass" as const;
  if (["grand", "electric", "pad", "organ", "strings", "sheng"].includes(instrument)) return "harmony" as const;
  if (["marimba", "guzheng", "pipa", "yangqin"].includes(instrument)) return "pluck" as const;
  return "lead" as const;
}

function generateSectionNotes(
  instrument: InstrumentId,
  style: ArrangementStyleId,
  lengthTicks: number,
  root: number,
  random: () => number,
  idFactory: (prefix: string) => string,
) {
  const preset = ARRANGEMENT_STYLE_PRESETS[style];
  const signature: TimeSignature = { numerator: 4, denominator: 4 };
  const perBar = barTicks(signature);
  const role = noteRole(instrument);
  const notes: MidiNoteV3[] = [];
  const progression = [0, 3, 4, 0];
  const push = (pitch: number, tick: number, durationTicks: number, velocity: number) => {
    if (tick >= lengthTicks) return;
    notes.push({ id: idFactory("note"), pitch: clampMidi(pitch), tick: Math.max(0, Math.round(tick)), durationTicks: Math.max(1, Math.min(Math.round(durationTicks), lengthTicks - tick)), velocity: clampMidi(velocity) });
  };
  const scalePitch = (degree: number, octave = 0) => root + preset.scale[((degree % preset.scale.length) + preset.scale.length) % preset.scale.length] + octave * 12;

  if (role === "drums") {
    for (let bar = 0; bar * perBar < lengthTicks; bar += 1) {
      const start = bar * perBar;
      if (instrument === "chinesePercussion") {
        [0, 2, 4, 6].forEach((eighth, index) => push([36, 48, 42, 45][(bar + index) % 4], start + eighth * STEP_TICKS * 2, STEP_TICKS, 84 + (index === 0 ? 28 : randomIndex(random, 20))));
        continue;
      }
      const kickSteps = style === "funk" ? [0, 6, 8, 14] : style === "lofi" ? [0, 8] : style === "cinematic" ? [0, 12] : [0, 4, 8, 12];
      const snareSteps = style === "cinematic" ? [8] : [4, 12];
      kickSteps.forEach((step) => push(36, start + step * STEP_TICKS, STEP_TICKS, 96 + randomIndex(random, 24)));
      snareSteps.forEach((step) => push(38, start + step * STEP_TICKS, STEP_TICKS, 92 + randomIndex(random, 22)));
      const hatEvery = style === "lofi" || style === "cinematic" ? 4 : 2;
      for (let step = 0; step < 16; step += hatEvery) {
        const swing = (style === "lofi" || style === "funk") && step % 4 !== 0 ? Math.round(STEP_TICKS * .22) : 0;
        push(step % 8 === 6 ? 46 : 42, start + step * STEP_TICKS + swing, STEP_TICKS, 58 + randomIndex(random, 30));
      }
    }
  } else if (role === "bass") {
    for (let bar = 0; bar * perBar < lengthTicks; bar += 1) {
      const degree = progression[bar % progression.length];
      const hits = style === "funk" ? [0, 3, 6, 10, 14] : style === "cinematic" ? [0] : [0, 4, 8, 12];
      hits.forEach((step, index) => push(36 + scalePitch(degree + (index === hits.length - 1 ? 1 : 0)), bar * perBar + step * STEP_TICKS, style === "cinematic" ? perBar : STEP_TICKS * 3, 78 + randomIndex(random, 30)));
    }
  } else if (role === "harmony") {
    const sustained = instrument === "pad" || instrument === "strings" || instrument === "sheng";
    const barsPerChord = style === "cinematic" && sustained ? 2 : 1;
    for (let bar = 0; bar * perBar < lengthTicks; bar += barsPerChord) {
      const degree = progression[Math.floor(bar / barsPerChord) % progression.length];
      const base = instrument === "grand" || instrument === "electric" ? 48 : 43;
      const duration = Math.min(lengthTicks - bar * perBar, perBar * barsPerChord - (sustained ? STEP_TICKS / 2 : STEP_TICKS * 2));
      [degree, degree + 2, degree + 4].forEach((chordDegree, index) => push(base + scalePitch(chordDegree), bar * perBar + (sustained ? 0 : index * Math.round(STEP_TICKS / 2)), duration, 58 + randomIndex(random, 28)));
    }
  } else {
    const step = style === "synthwave" || style === "funk" ? STEP_TICKS : STEP_TICKS * 2;
    const base = instrument === "dizi" || instrument === "suona" ? 72 : instrument === "erhu" ? 67 : 60;
    const count = Math.ceil(lengthTicks / step);
    for (let index = 0; index < count; index += 1) {
      const tick = index * step + ((style === "lofi" || style === "funk") && index % 2 ? Math.round(step * .14) : 0);
      if (role === "lead" && random() > preset.density) continue;
      const bar = Math.floor(tick / perBar);
      const degree = progression[bar % progression.length] + (role === "pluck" ? index % 5 : randomIndex(random, preset.scale.length));
      const duration = role === "pluck" ? Math.round(step * .72) : Math.min(step * (random() > .78 ? 2 : 1), perBar);
      push(base + scalePitch(degree), tick, duration, (role === "pluck" ? 66 : 72) + randomIndex(random, 36));
    }
  }

  if (!notes.length) push(60 + root, 0, Math.min(perBar, lengthTicks), 88);
  return notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

export type GeneratedArrangement = {
  bpm: number;
  lengthBars: number;
  sections: SongSectionV3[];
  tracks: MidiTrackV3[];
};

export function generateStyledArrangement({
  defaults,
  sectionCount = 5,
  style = "mixed",
  random = Math.random,
  idFactory = (prefix: string) => projectUid(prefix),
}: {
  defaults: InstrumentDefaults;
  sectionCount?: number;
  style?: ArrangementStyleMode;
  random?: () => number;
  idFactory?: (prefix: string) => string;
}): GeneratedArrangement {
  const count = Math.max(3, Math.min(6, Math.round(sectionCount)));
  const templates = SECTION_TEMPLATES[count];
  const styles = sectionStyles(style, count, random);
  const signature: TimeSignature = { numerator: 4, denominator: 4 };
  const perBar = barTicks(signature);
  const root = [0, 2, 5, 7, 9][randomIndex(random, 5)];
  let cursor = 0;
  const sections = templates.map((template, index): SongSectionV3 => {
    const sectionStyle = styles[index];
    const preset = ARRANGEMENT_STYLE_PRESETS[sectionStyle];
    const instruments = SECTION_LAYERS[template.role].map((layer) => preset.ensemble[layer]).filter((item): item is InstrumentId => Boolean(item));
    const lengthTicks = template.bars * perBar;
    const section = { id: idFactory("section"), role: template.role, style: sectionStyle, startTick: cursor, lengthTicks, color: preset.color, instruments };
    cursor += lengthTicks;
    return section;
  });
  const instruments = [...new Set(sections.flatMap((section) => section.instruments))];
  let melodicChannel = 0;
  const tracks = instruments.map((instrument, trackIndex): MidiTrackV3 => {
    const preset = defaults[instrument];
    const percussion = instrument === "drums" || instrument === "chinesePercussion";
    while (melodicChannel === 9) melodicChannel += 1;
    const channel = percussion ? 9 : melodicChannel++ % 16;
    return {
      id: idFactory("track"), name: preset.name.toUpperCase(), instrument, color: preset.color, program: preset.program, channel,
      volume: instrument === "bass" ? 74 : percussion ? 80 : 70, pan: percussion || instrument === "bass" ? 0 : (trackIndex % 2 === 0 ? -14 : 14),
      reverb: noteRole(instrument) === "harmony" ? 34 : 18, mute: false, solo: false, arm: trackIndex === 0,
      clips: sections.filter((section) => section.instruments.includes(instrument)).map((section) => ({
        id: idFactory("clip"), name: `${section.role.toUpperCase()} · ${section.style.toUpperCase()}`, startTick: section.startTick,
        contentLengthTicks: section.lengthTicks, displayLengthTicks: section.lengthTicks, loopEnabled: false,
        notes: generateSectionNotes(instrument, section.style, section.lengthTicks, root, random, idFactory),
      })),
    };
  });
  const selectedPreset = style === "mixed" ? null : ARRANGEMENT_STYLE_PRESETS[style];
  const bpm = selectedPreset
    ? Math.round(selectedPreset.bpm[0] + random() * (selectedPreset.bpm[1] - selectedPreset.bpm[0]))
    : 104 + randomIndex(random, 15);
  return { bpm, lengthBars: Math.ceil(cursor / perBar), sections, tracks };
}

export function createEmptyProject(tracks: MidiTrackV3[], name = "UNTITLED SESSION"): ProjectDocumentV3 {
  const signature: TimeSignature = { numerator: 4, denominator: 4 };
  const perBar = barTicks(signature);
  return {
    version: PROJECT_VERSION,
    id: projectUid("project"),
    name,
    ppq: PPQ,
    bpm: 112,
    timeSignature: signature,
    lengthBars: DEFAULT_SONG_BARS,
    masterVolume: 78,
    loop: { enabled: true, startTick: 0, endTick: perBar * 4 },
    sections: [],
    tracks,
    updatedAt: Date.now(),
  };
}

export function songEndTick(project: Pick<ProjectDocumentV3, "lengthBars" | "timeSignature" | "ppq">) {
  return project.lengthBars * barTicks(project.timeSignature, project.ppq);
}

export function requiredSongBars(project: Pick<ProjectDocumentV3, "lengthBars" | "timeSignature" | "ppq">, requiredEndTick: number) {
  const perBar = barTicks(project.timeSignature, project.ppq);
  const required = Math.max(1, Math.ceil(requiredEndTick / perBar));
  if (required <= project.lengthBars) return project.lengthBars;
  return Math.ceil(required / SONG_EXTENSION_BARS) * SONG_EXTENSION_BARS;
}

export function projectContentEnd(project: ProjectDocumentV3) {
  return project.tracks.reduce((end, track) => track.clips.reduce((trackEnd, clip) => Math.max(trackEnd, clip.startTick + clip.displayLengthTicks), end), 0);
}

export function expandClipNotes(clip: MidiClipV3, fromTick = clip.startTick, toTick = clip.startTick + clip.displayLengthTicks) {
  const result: Array<MidiNoteV3 & { songTick: number }> = [];
  const clipEnd = clip.startTick + clip.displayLengthTicks;
  const content = Math.max(STEP_TICKS, clip.contentLengthTicks);
  const repetitions = clip.loopEnabled ? Math.ceil(clip.displayLengthTicks / content) : 1;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const occurrenceStart = clip.startTick + repetition * content;
    for (const note of clip.notes) {
      const songTick = occurrenceStart + note.tick;
      if (songTick < clip.startTick || songTick >= clipEnd || songTick < fromTick || songTick >= toTick) continue;
      result.push({ ...note, songTick, durationTicks: Math.min(note.durationTicks, clipEnd - songTick) });
    }
  }
  return result.sort((a, b) => a.songTick - b.songTick || a.pitch - b.pitch);
}

export function splitClip(clip: MidiClipV3, songTick: number): [MidiClipV3, MidiClipV3] | null {
  const splitAt = Math.round(songTick - clip.startTick);
  if (splitAt <= STEP_TICKS || splitAt >= clip.displayLengthTicks - STEP_TICKS) return null;
  const left: MidiClipV3 = { ...clip, id: projectUid("clip"), displayLengthTicks: splitAt, contentLengthTicks: Math.min(clip.contentLengthTicks, splitAt), notes: clip.notes.filter((note) => note.tick < splitAt).map((note) => ({ ...note, durationTicks: Math.min(note.durationTicks, splitAt - note.tick) })) };
  const rightLength = clip.displayLengthTicks - splitAt;
  const rightNotes = clip.loopEnabled
    ? expandClipNotes(clip, songTick, clip.startTick + clip.displayLengthTicks).map((note) => ({ id: projectUid("note"), pitch: note.pitch, tick: note.songTick - songTick, durationTicks: note.durationTicks, velocity: note.velocity }))
    : clip.notes.filter((note) => note.tick >= splitAt).map((note) => ({ ...note, tick: note.tick - splitAt }));
  const right: MidiClipV3 = { ...clip, id: projectUid("clip"), startTick: songTick, displayLengthTicks: rightLength, contentLengthTicks: clip.loopEnabled ? Math.min(clip.contentLengthTicks, rightLength) : rightLength, notes: rightNotes };
  return [left, right];
}

function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === "string" && (INSTRUMENT_IDS as readonly string[]).includes(value);
}

function isArrangementStyleId(value: unknown): value is ArrangementStyleId {
  return typeof value === "string" && (ARRANGEMENT_STYLE_IDS as readonly string[]).includes(value);
}

function isSongSectionRole(value: unknown): value is SongSectionRole {
  return typeof value === "string" && ["intro", "verse", "prechorus", "chorus", "bridge", "finale"].includes(value);
}

export function migrateProjectV2(input: LegacyProjectV2, defaults: InstrumentDefaults): ProjectDocumentV3 {
  const signature: TimeSignature = { numerator: 4, denominator: 4 };
  const twoBars = barTicks(signature) * 2;
  const sourceTracks = Array.isArray(input.tracks) ? input.tracks : [];
  const tracks: MidiTrackV3[] = sourceTracks.map((legacy, index) => {
    const instrument = isInstrumentId(legacy.instrument) ? legacy.instrument : "grand";
    const preset = defaults[instrument];
    const notes = Array.isArray(legacy.notes) ? legacy.notes.map((note) => ({
      id: note.id || projectUid("note"),
      pitch: clampMidi(note.note),
      tick: Math.max(0, Math.round(note.start * STEP_TICKS)),
      durationTicks: Math.max(1, Math.round(note.duration * STEP_TICKS)),
      velocity: clampMidi(note.velocity || 96),
    })) : [];
    return {
      id: legacy.id || projectUid("track"), name: legacy.name || preset.name, instrument, color: legacy.color || preset.color,
      program: legacy.program ?? preset.program, channel: legacy.channel ?? preset.channel ?? (instrument === "drums" || instrument === "chinesePercussion" ? 9 : index % 16),
      volume: Number.isFinite(legacy.volume) ? legacy.volume : 76, pan: Number.isFinite(legacy.pan) ? legacy.pan : 0,
      reverb: Number.isFinite(legacy.reverb) ? legacy.reverb : 18, mute: Boolean(legacy.mute), solo: Boolean(legacy.solo), arm: Boolean(legacy.arm),
      clips: [createClip(0, twoBars, legacy.name || "MIDI CLIP", notes)],
    };
  });
  const project = createEmptyProject(tracks, input.name || "MIGRATED SESSION");
  project.bpm = Math.max(40, Math.min(240, Number(input.bpm) || 112));
  project.masterVolume = Number.isFinite(input.masterVolume) ? Math.max(0, Math.min(100, Number(input.masterVolume))) : 78;
  return project;
}

export function normalizeProjectV3(input: unknown, defaults: InstrumentDefaults): ProjectDocumentV3 {
  if (!input || typeof input !== "object") throw new Error("Invalid project document");
  const raw = input as Partial<ProjectDocumentV3> & LegacyProjectV2;
  if (raw.version !== PROJECT_VERSION || !Array.isArray(raw.tracks)) return migrateProjectV2(raw, defaults);
  const signature: TimeSignature = {
    numerator: Math.max(1, Math.min(12, Math.round(raw.timeSignature?.numerator || 4))),
    denominator: [2, 4, 8, 16].includes(raw.timeSignature?.denominator ?? 4) ? raw.timeSignature!.denominator : 4,
  } as TimeSignature;
  const tracks = raw.tracks.slice(0, 128).map((candidate, index) => {
    const track = candidate as MidiTrackV3;
    const instrument = isInstrumentId(track.instrument) ? track.instrument : "grand";
    const preset = defaults[instrument];
    return {
      id: track.id || projectUid("track"), name: track.name || preset.name, instrument, color: track.color || preset.color,
      program: Number.isFinite(track.program) ? track.program : preset.program, channel: Number.isFinite(track.channel) ? Math.max(0, Math.min(15, track.channel)) : index % 16,
      volume: Number.isFinite(track.volume) ? Math.max(0, Math.min(100, Number(track.volume))) : 76,
      pan: Number.isFinite(track.pan) ? Math.max(-100, Math.min(100, Number(track.pan))) : 0,
      reverb: Number.isFinite(track.reverb) ? Math.max(0, Math.min(100, Number(track.reverb))) : 0,
      mute: Boolean(track.mute), solo: Boolean(track.solo), arm: Boolean(track.arm),
      clips: (Array.isArray(track.clips) ? track.clips : []).map((clip) => ({
        id: clip.id || projectUid("clip"), name: clip.name || "MIDI CLIP", startTick: Math.max(0, Math.round(clip.startTick || 0)),
        contentLengthTicks: Math.max(STEP_TICKS, Math.round(clip.contentLengthTicks || barTicks(signature))),
        displayLengthTicks: Math.max(STEP_TICKS, Math.round(clip.displayLengthTicks || clip.contentLengthTicks || barTicks(signature))), loopEnabled: Boolean(clip.loopEnabled),
        notes: (Array.isArray(clip.notes) ? clip.notes : []).map((note) => ({ id: note.id || projectUid("note"), pitch: clampMidi(note.pitch), tick: Math.max(0, Math.round(note.tick || 0)), durationTicks: Math.max(1, Math.round(note.durationTicks || STEP_TICKS)), velocity: clampMidi(note.velocity || 96) })),
      })),
    };
  });
  const project: ProjectDocumentV3 = {
    version: PROJECT_VERSION, id: raw.id || projectUid("project"), name: raw.name || "UNTITLED SESSION", ppq: PPQ,
    bpm: Math.max(40, Math.min(240, Number(raw.bpm) || 112)), timeSignature: signature, lengthBars: Math.max(DEFAULT_SONG_BARS, Math.round(raw.lengthBars || DEFAULT_SONG_BARS)),
    masterVolume: Number.isFinite(raw.masterVolume) ? Math.max(0, Math.min(100, Number(raw.masterVolume))) : 78,
    loop: { enabled: Boolean(raw.loop?.enabled), startTick: Math.max(0, Math.round(raw.loop?.startTick || 0)), endTick: Math.max(STEP_TICKS, Math.round(raw.loop?.endTick || barTicks(signature) * 4)) },
    sections: (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 32).map((candidate) => {
      const section = candidate as SongSectionV3;
      const style = isArrangementStyleId(section.style) ? section.style : "synthwave";
      return {
        id: section.id || projectUid("section"), role: isSongSectionRole(section.role) ? section.role : "verse", style,
        startTick: Math.max(0, Math.round(section.startTick || 0)), lengthTicks: Math.max(STEP_TICKS, Math.round(section.lengthTicks || barTicks(signature) * 4)),
        color: section.color || ARRANGEMENT_STYLE_PRESETS[style].color,
        instruments: (Array.isArray(section.instruments) ? section.instruments : []).filter(isInstrumentId),
      };
    }),
    tracks, updatedAt: Number(raw.updatedAt) || Date.now(),
  };
  project.lengthBars = requiredSongBars(project, Math.max(projectContentEnd(project), project.loop.endTick));
  return project;
}
