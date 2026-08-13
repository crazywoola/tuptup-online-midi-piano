export const FLUID_SOUNDFONT_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";
export const SOUNDFONT_CACHE_NAME = "tuptup-soundfonts-v2";
export const SAMPLE_ANCHOR_NOTES = [36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96] as const;

export const INSTRUMENT_IDS = [
  "grand", "electric", "pad", "bass", "lead", "organ", "marimba", "strings", "drums",
  "guzheng", "erhu", "pipa", "dizi", "yangqin", "suona", "sheng", "chinesePercussion",
] as const;

export type InstrumentId = typeof INSTRUMENT_IDS[number];
export type SampleStatus = "idle" | "loading" | "ready" | "fallback" | "error";

export type SoundfontSampleSource = {
  kind: "soundfont";
  asset: string;
  url: string;
  source: "FluidR3 GM";
  license: "CC BY 3.0";
  expectedNotes: 88;
  loadingStrategy: "stream-88-anchor-first";
  fallback: "immediate-synth";
};

export type AudioSampleSource = {
  kind: "audio";
  asset: string;
  rootNote: number;
  source: "Berklee BISA";
  license: "CC BY 4.0";
  loadingStrategy: "local-single-note";
  fallback: "immediate-synth";
};

export type SampleSpec = SoundfontSampleSource | AudioSampleSource;
export type SampleSource = SampleSpec;

function soundfont(asset: string): SoundfontSampleSource {
  return {
    kind: "soundfont",
    asset,
    url: `${FLUID_SOUNDFONT_BASE}/${asset}-mp3.js`,
    source: "FluidR3 GM",
    license: "CC BY 3.0",
    expectedNotes: 88,
    loadingStrategy: "stream-88-anchor-first",
    fallback: "immediate-synth",
  };
}

export const SAMPLE_SOURCES: Record<InstrumentId, SampleSource> = {
  grand: soundfont("acoustic_grand_piano"),
  electric: soundfont("electric_piano_1"),
  pad: soundfont("pad_2_warm"),
  bass: soundfont("synth_bass_1"),
  lead: soundfont("lead_2_sawtooth"),
  organ: soundfont("drawbar_organ"),
  marimba: soundfont("marimba"),
  strings: soundfont("string_ensemble_1"),
  drums: soundfont("synth_drum"),
  guzheng: soundfont("koto"),
  erhu: { kind: "audio", asset: "/samples/chinese/erhu-vibrato-a4.wav", rootNote: 69, source: "Berklee BISA", license: "CC BY 4.0", loadingStrategy: "local-single-note", fallback: "immediate-synth" },
  pipa: soundfont("shamisen"),
  dizi: soundfont("flute"),
  yangqin: soundfont("dulcimer"),
  suona: soundfont("shanai"),
  sheng: soundfont("reed_organ"),
  chinesePercussion: soundfont("taiko_drum"),
};

export type SoundfontEntry = {
  key: string;
  note: number;
  dataUrl: string;
};

export function soundfontKeyToMidi(key: string) {
  const match = /^([A-G])([b#]?)(-?\d+)$/.exec(key);
  if (!match) return null;
  const naturalNotes: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === "b" ? -1 : match[2] === "#" ? 1 : 0;
  return (Number(match[3]) + 1) * 12 + naturalNotes[match[1]] + accidental;
}

export function parseMidiJsSoundfont(javascript: string): SoundfontEntry[] {
  const entries: SoundfontEntry[] = [];
  const samplePattern = /"([A-G](?:b|#)?-?\d+)"\s*:\s*"(data:audio\/(?:mp3|mpeg);base64,[A-Za-z0-9+/=]+)"/g;
  for (const match of javascript.matchAll(samplePattern)) {
    const note = soundfontKeyToMidi(match[1]);
    if (note !== null) entries.push({ key: match[1], note, dataUrl: match[2] });
  }
  entries.sort((a, b) => a.note - b.note);
  if (entries.length < 12) throw new Error(`Invalid MIDI.js SoundFont: found ${entries.length} playable notes`);
  return entries;
}

export function nearestSoundfontEntry(entries: SoundfontEntry[], target: number) {
  if (!entries.length) return null;
  return entries.reduce((nearest, entry) => Math.abs(entry.note - target) < Math.abs(nearest.note - target) ? entry : nearest);
}

export function chooseSoundfontAnchors(entries: SoundfontEntry[], targets: readonly number[] = SAMPLE_ANCHOR_NOTES) {
  const chosen = new Map<number, SoundfontEntry>();
  for (const target of targets) {
    const nearest = nearestSoundfontEntry(entries, target);
    if (nearest) chosen.set(nearest.note, nearest);
  }
  return [...chosen.values()];
}

export async function decodeSoundfontAnchors<T>(entries: SoundfontEntry[], decode: (entry: SoundfontEntry) => Promise<T>) {
  return Promise.all(chooseSoundfontAnchors(entries).map(async (entry) => ({ note: entry.note, buffer: await decode(entry) })));
}

export function dataUrlToArrayBuffer(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:audio/")) throw new Error("Invalid audio data URL");
  const binary = globalThis.atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export async function fetchSoundfontText(source: SoundfontSampleSource, options: { force?: boolean; timeoutMs?: number; onProgress?: (value: number | null) => void } = {}) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const cache = typeof caches === "undefined" ? null : await caches.open(SOUNDFONT_CACHE_NAME);
    if (options.force) await cache?.delete(source.url);
    const cached = await cache?.match(source.url);
    if (cached) {
      options.onProgress?.(100);
      return cached.text();
    }
    const response = await fetch(source.url, { mode: "cors", signal: controller.signal });
    if (!response.ok) throw new Error(`SoundFont request failed with ${response.status}`);
    await cache?.put(source.url, response.clone());
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body || !total) {
      options.onProgress?.(null);
      const text = await response.text();
      options.onProgress?.(100);
      return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
      options.onProgress?.(Math.min(99, Math.round(received / total * 100)));
    }
    text += decoder.decode();
    options.onProgress?.(100);
    return text;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
