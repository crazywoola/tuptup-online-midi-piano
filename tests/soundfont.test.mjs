import assert from "node:assert/strict";
import test from "node:test";
import { importTypescriptModule } from "../scripts/import-typescript-module.mjs";

const soundfont = await importTypescriptModule(new URL("../lib/soundfont.ts", import.meta.url));

const KEYS = ["A0", "Bb0", "B0", "C1", "Db1", "D1", "Eb1", "E1", "F1", "Gb1", "G1", "Ab1"];
const FIXTURE = `
if (typeof MIDI === "undefined") var MIDI = {};
MIDI.Soundfont = MIDI.Soundfont || {};
MIDI.Soundfont.acoustic_grand_piano = {
${KEYS.map((key, index) => `  "${key}": "data:audio/mp3;base64,SUQz${String(index).padStart(2, "0")}=",`).join("\n")}
};
`;

test("safely parses MIDI.js wrappers and trailing commas without eval", () => {
  const entries = soundfont.parseMidiJsSoundfont(FIXTURE);
  assert.equal(entries.length, 12);
  assert.equal(entries[0].key, "A0");
  assert.equal(entries[0].note, 21);
  assert.equal(entries.at(-1).key, "Ab1");
  assert.throws(() => soundfont.parseMidiJsSoundfont("MIDI.Soundfont = {};"), /Invalid MIDI\.js SoundFont/);
});

test("defines licensed, playable sources for all 17 instruments", () => {
  assert.equal(soundfont.INSTRUMENT_IDS.length, 17);
  assert.deepEqual(Object.keys(soundfont.SAMPLE_SOURCES), [...soundfont.INSTRUMENT_IDS]);
  for (const id of soundfont.INSTRUMENT_IDS) {
    const source = soundfont.SAMPLE_SOURCES[id];
    assert.ok(source.asset, `${id} is missing an asset`);
    assert.match(source.license, /^CC BY (3\.0|4\.0)$/);
    assert.equal(source.fallback, "immediate-synth");
    if (source.kind === "soundfont") {
      assert.equal(source.expectedNotes, 88);
      assert.equal(source.loadingStrategy, "stream-88-anchor-first");
      assert.match(source.url, /^https:\/\/gleitz\.github\.io\//);
    } else {
      assert.equal(id, "erhu");
      assert.equal(source.rootNote, 69);
      assert.equal(source.loadingStrategy, "local-single-note");
    }
  }
});

test("chooses stable nearest anchors and validates audio data URLs", () => {
  const entries = soundfont.parseMidiJsSoundfont(FIXTURE);
  assert.equal(soundfont.nearestSoundfontEntry(entries, 23).note, 23);
  const anchors = soundfont.chooseSoundfontAnchors(entries, [21, 25, 31]);
  assert.deepEqual(anchors.map((entry) => entry.note), [21, 25, 31]);
  assert.ok(soundfont.dataUrlToArrayBuffer("data:audio/mp3;base64,SUQz").byteLength > 0);
  assert.throws(() => soundfont.dataUrlToArrayBuffer("data:text/plain;base64,SGk="), /Invalid audio data URL/);
});

test("surfaces MP3 decode failures so the player can retain its synth fallback", async () => {
  const entries = Array.from({ length: 88 }, (_, index) => ({ key: `N${index}`, note: 21 + index, dataUrl: "data:audio/mp3;base64,SUQz" }));
  await assert.rejects(soundfont.decodeSoundfontAnchors(entries, async () => { throw new DOMException("decode failed", "EncodingError"); }), /decode failed/);
});

test("uses versioned Cache Storage and supports a forced refresh", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cacheEntries = new Map();
  let requests = 0;
  const cache = {
    async match(key) { return cacheEntries.get(key)?.clone(); },
    async put(key, response) { cacheEntries.set(key, response.clone()); },
    async delete(key) { return cacheEntries.delete(key); },
  };
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { async open(name) { assert.equal(name, "tuptup-soundfonts-v2"); return cache; } } });
  globalThis.fetch = async () => { requests += 1; return new Response(FIXTURE); };
  try {
    const source = soundfont.SAMPLE_SOURCES.grand;
    assert.equal(await soundfont.fetchSoundfontText(source), FIXTURE);
    assert.equal(await soundfont.fetchSoundfontText(source), FIXTURE);
    assert.equal(requests, 1);
    assert.equal(await soundfont.fetchSoundfontText(source, { force: true }), FIXTURE);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "caches", { configurable: true, value: originalCaches });
  }
});

test("aborts stalled SoundFont requests at the configured timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: undefined });
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  try {
    await assert.rejects(soundfont.fetchSoundfontText(soundfont.SAMPLE_SOURCES.pad, { timeoutMs: 5 }), /Aborted/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "caches", { configurable: true, value: originalCaches });
  }
});
