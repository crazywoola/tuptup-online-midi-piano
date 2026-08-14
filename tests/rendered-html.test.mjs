import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the TupTup Studio workstation", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /TupTup Studio/i);
  assert.match(html, /Browser MIDI Workstation/i);
  assert.match(html, /TupTup TS01-MIDI/i);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(html, /Your site is taking shape/i);
});

test("server-renders the standalone bilingual feature guide", async () => {
  const response = await render("/guide");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /功能说明书/);
  assert.match(html, /60 秒快速开始/);
  assert.match(html, /步进输入/);
  assert.match(html, /STEP INPUT/);
  assert.match(html, /返回工作台/);
});

test("keeps the public metadata, licensed sources, and MIDI privacy promise", async () => {
  const [layout, page, midiInput, soundfont, readme, license, sampleCredits, erhuSample] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/StudioWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/midi-input.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/soundfont.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_SAMPLES.md", import.meta.url), "utf8"),
    readFile(new URL("../public/samples/chinese/erhu-vibrato-a4.wav", import.meta.url)),
  ]);

  assert.match(layout, /og-studio\.png/);
  assert.match(page, /requestMIDIAccess/);
  assert.match(page, /MidiInputController/);
  assert.match(midiInput, /onstatechange/);
  assert.match(readme, /SAM5704/);
  assert.match(readme, /does not upload performance\s+data/i);
  assert.match(page, /guzheng/);
  assert.match(page, /chinesePercussion/);
  assert.match(soundfont, /FluidR3_GM/);
  assert.match(soundfont, /acoustic_grand_piano/);
  assert.match(soundfont, /taiko_drum/);
  assert.match(sampleCredits, /Berklee Intersectional Soundbox Archive/);
  assert.match(sampleCredits, /Creative Commons Attribution 4\.0/);
  assert.equal(erhuSample.subarray(0, 4).toString("ascii"), "RIFF");
  assert.match(license, /MIT License/);
});

test("ships a persistent Chinese and English interface for every instrument", async () => {
  const [page, soundfont] = await Promise.all([
    readFile(new URL("../components/StudioWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/soundfont.ts", import.meta.url), "utf8"),
  ]);
  const instrumentIds = [
    "grand", "electric", "pad", "bass", "lead", "organ", "marimba", "strings", "drums",
    "guzheng", "erhu", "pipa", "dizi", "yangqin", "suona", "sheng", "chinesePercussion",
  ];

  assert.match(page, /const UI_TEXT = \{\s*zh:/s);
  assert.match(page, /\n\s*en: \{/);
  assert.match(page, /tuptup-studio-locale/);
  assert.match(page, /navigator\.language/);
  assert.match(page, /className="language-toggle"/);
  assert.match(page, /document\.documentElement\.lang/);
  assert.match(page, /Chinese Sample Suite/);
  assert.match(page, /国风采样套组/);
  assert.match(page, /Check All 17 Instruments/);
  assert.match(page, /完成你的第一首歌/);
  assert.match(page, /data-sound-check-id/);

  for (const id of instrumentIds) {
    const instrumentLine = page.split("\n").find((line) => line.includes(`id: "${id}"`));
    assert.ok(instrumentLine, `missing instrument ${id}`);
    assert.match(instrumentLine, /nameZh: ".+"/);
    assert.match(instrumentLine, /nameEn: ".+"/);
    assert.match(instrumentLine, /familyZh: ".+"/);
    assert.match(instrumentLine, /familyEn: ".+"/);
    assert.match(soundfont, new RegExp(`\\b${id}:`), `missing sample mapping for ${id}`);
  }
});

test("provides stable roll input from the shared 61-key keyboard", async () => {
  const [page, guide, styles] = await Promise.all([
    readFile(new URL("../components/StudioWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/guide/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const EDITOR_LOW = KEYBOARD_LOW/);
  assert.match(page, /const EDITOR_HIGH = KEYBOARD_HIGH/);
  assert.match(page, /stepInputRef\.current/);
  assert.match(page, /insertNoteAtSongTick\(trackId, selectedClipId/);
  assert.match(page, /GRID_VALUES\[stepLength\]/);
  assert.match(page, /href="\/guide#roll-input"/);
  assert.doesNotMatch(page, /className="compact-track-list"/);
  assert.doesNotMatch(page, /className="library-tabs"/);
  assert.match(guide, /How does the keyboard add notes to the Piano Roll/);
  assert.match(guide, /How do I verify all 17 instruments/);
  assert.match(guide, /A W S E D F T G Y H U J K/);
  assert.match(styles, /grid-template-rows: repeat\(61, 1fr\)/);
  assert.doesNotMatch(styles, /\.piano-key\.white\.active\s*\{[^}]*transform/s);
  assert.doesNotMatch(styles, /\.piano-key\.black\.active\s*\{[^}]*transform/s);
});

test("ships clip ideas and undoable multi-section style generation with readable controls", async () => {
  const [page, project, styles, guide] = await Promise.all([
    readFile(new URL("../components/StudioWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/project.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/guide/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /randomizeClip/);
  assert.match(page, /randomize-button/);
  assert.match(page, /随机灵感/);
  assert.match(page, /generateRandomSong/);
  assert.match(page, /random-song-button/);
  assert.match(page, /随机整曲/);
  assert.match(page, /randomSongSectionCount/);
  assert.match(project, /generateRandomNotes/);
  assert.match(project, /randomizeNoteValues/);
  assert.match(project, /generateStyledArrangement/);
  assert.match(project, /ARRANGEMENT_STYLE_IDS/);
  assert.match(styles, /min-height:\s*34px/);
  assert.match(styles, /musical surfaces retain their fixed geometry/i);
  assert.match(styles, /song-section-marker/);
  assert.match(styles, /random-style-grid/);
  assert.match(guide, /Random Idea/);
  assert.match(guide, /RANDOM SONG/);
  assert.match(guide, /Mixed, Synthwave, Lo-Fi, Cinematic, Guofeng, or Funk/);
});
