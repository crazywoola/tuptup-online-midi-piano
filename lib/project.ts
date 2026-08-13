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
    tracks, updatedAt: Number(raw.updatedAt) || Date.now(),
  };
  project.lengthBars = requiredSongBars(project, Math.max(projectContentEnd(project), project.loop.endTick));
  return project;
}
