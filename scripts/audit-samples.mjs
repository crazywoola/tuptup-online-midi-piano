import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { importTypescriptModule } from "./import-typescript-module.mjs";

const execFileAsync = promisify(execFile);

const {
  INSTRUMENT_IDS,
  SAMPLE_SOURCES,
  chooseSoundfontAnchors,
  parseMidiJsSoundfont,
} = await importTypescriptModule(new URL("../lib/soundfont.ts", import.meta.url));

function mp3Signature(dataUrl) {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const hasId3 = bytes.subarray(0, 3).toString("ascii") === "ID3";
  const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!hasId3 && !hasFrameSync) throw new Error("representative sample does not start with MP3 data");
  return `${Math.round(bytes.byteLength / 1024)} KB note`;
}

async function auditInstrument(id) {
  const source = SAMPLE_SOURCES[id];
  if (source.kind === "audio") {
    const wav = await readFile(new URL(`../public${source.asset}`, import.meta.url));
    if (wav.subarray(0, 4).toString("ascii") !== "RIFF" || wav.subarray(8, 12).toString("ascii") !== "WAVE") throw new Error("invalid WAV header");
    return { id, asset: source.asset.split("/").at(-1), notes: 1, anchors: 1, proof: `${Math.round(wav.byteLength / 1024)} KB WAV` };
  }

  const { stdout: javascript } = await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--location", "--max-time", "60", source.url], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 65_000,
  });
  const entries = parseMidiJsSoundfont(javascript);
  if (entries.length !== source.expectedNotes) throw new Error(`expected ${source.expectedNotes} notes, found ${entries.length}`);
  const anchors = chooseSoundfontAnchors(entries);
  if (anchors.length !== 11) throw new Error(`expected 11 anchors, found ${anchors.length}`);
  return { id, asset: source.asset, notes: entries.length, anchors: anchors.length, proof: mp3Signature(entries[Math.floor(entries.length / 2)].dataUrl) };
}

const results = [];
const failures = [];
const queue = [...INSTRUMENT_IDS];

async function worker() {
  while (queue.length) {
    const id = queue.shift();
    try {
      const result = await auditInstrument(id);
      results.push(result);
      console.log(`✓ ${id.padEnd(19)} ${String(result.notes).padStart(2)} notes · ${String(result.anchors).padStart(2)} anchors · ${result.asset}`);
    } catch (error) {
      failures.push({ id, error });
      console.error(`✗ ${id.padEnd(19)} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

await Promise.all(Array.from({ length: 4 }, worker));
console.log(`\nSample audit: ${results.length}/${INSTRUMENT_IDS.length} instruments passed.`);
if (failures.length) process.exitCode = 1;
