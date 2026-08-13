import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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

test("keeps the public metadata and MIDI privacy promise", async () => {
  const [layout, page, readme, license] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /og-studio\.png/);
  assert.match(page, /requestMIDIAccess/);
  assert.match(page, /inputs\.map/);
  assert.match(readme, /SAM5704/);
  assert.match(readme, /does not upload performance\s+data/i);
  assert.match(license, /MIT License/);
});
