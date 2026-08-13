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

test("keeps the public metadata and MIDI privacy promise", async () => {
  const [layout, page, readme, license, sampleCredits, erhuSample] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_SAMPLES.md", import.meta.url), "utf8"),
    readFile(new URL("../public/samples/chinese/erhu-vibrato-a4.wav", import.meta.url)),
  ]);

  assert.match(layout, /og-studio\.png/);
  assert.match(page, /requestMIDIAccess/);
  assert.match(page, /inputs\.map/);
  assert.match(readme, /SAM5704/);
  assert.match(readme, /does not upload performance\s+data/i);
  assert.match(page, /guzheng/);
  assert.match(page, /chinesePercussion/);
  assert.match(page, /FluidR3_GM/);
  assert.match(sampleCredits, /Berklee Intersectional Soundbox Archive/);
  assert.match(sampleCredits, /Creative Commons Attribution 4\.0/);
  assert.equal(erhuSample.subarray(0, 4).toString("ascii"), "RIFF");
  assert.match(license, /MIT License/);
});

test("ships a persistent Chinese and English interface for every instrument", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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

  for (const id of instrumentIds) {
    const instrumentLine = page.split("\n").find((line) => line.includes(`id: "${id}"`));
    assert.ok(instrumentLine, `missing instrument ${id}`);
    assert.match(instrumentLine, /nameZh: ".+"/);
    assert.match(instrumentLine, /nameEn: ".+"/);
    assert.match(instrumentLine, /familyZh: ".+"/);
    assert.match(instrumentLine, /familyEn: ".+"/);
  }
});

test("provides stable roll input from the shared 61-key keyboard", async () => {
  const [page, guide, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/guide/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const EDITOR_LOW = KEYBOARD_LOW/);
  assert.match(page, /const EDITOR_HIGH = KEYBOARD_HIGH/);
  assert.match(page, /stepInputRef\.current/);
  assert.match(page, /id: uid\("step"\)/);
  assert.match(page, /href="\/guide#roll-input"/);
  assert.doesNotMatch(page, /className="compact-track-list"/);
  assert.doesNotMatch(page, /className="library-tabs"/);
  assert.match(guide, /How does the keyboard add notes to the Piano Roll/);
  assert.match(guide, /A W S E D F T G Y H U J K/);
  assert.match(styles, /grid-template-rows: repeat\(61, 1fr\)/);
});
