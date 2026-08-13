import assert from "node:assert/strict";
import test from "node:test";
import { importTypescriptModule } from "../scripts/import-typescript-module.mjs";

const { MidiInputController, parseMidiPerformanceMessage } = await importTypescriptModule(new URL("../lib/midi-input.ts", import.meta.url));

function fakeInput(id, name = id) {
  return {
    id,
    name,
    manufacturer: "Test",
    state: "connected",
    connection: "closed",
    onmidimessage: null,
    openCount: 0,
    async open() {
      this.openCount += 1;
      this.connection = "open";
      return this;
    },
    emit(data, timeStamp) {
      this.onmidimessage?.({ data: Uint8Array.from(data), timeStamp });
    },
  };
}

function fakeAccess(inputs) {
  return { inputs: new Map(inputs.map((input) => [input.id, input])), onstatechange: null };
}

test("normalizes the MIDI messages used by the performance UI", () => {
  assert.deepEqual(parseMidiPerformanceMessage([0x92, 60, 100]), { type: "note-on", channel: 2, note: 60, velocity: 100 });
  assert.deepEqual(parseMidiPerformanceMessage([0x82, 60, 12]), { type: "note-off", channel: 2, note: 60, velocity: 12 });
  assert.deepEqual(parseMidiPerformanceMessage([0x92, 60, 0]), { type: "note-off", channel: 2, note: 60, velocity: 0 });
  assert.deepEqual(parseMidiPerformanceMessage([0xb4, 64, 127]), { type: "sustain", channel: 4, enabled: true });
  assert.equal(parseMidiPerformanceMessage([0xb0, 1, 127]), null);
  assert.equal(parseMidiPerformanceMessage([0xf8]), null);
});

test("reconnecting reuses open inputs and installs one live message route", async () => {
  const input = fakeInput("keyboard", "TupTup TS01-MIDI");
  const access = fakeAccess([input]);
  const messages = [];
  const inputSnapshots = [];
  const controller = new MidiInputController({
    onMessage: (message) => messages.push(message),
    onInputsChanged: (inputs) => inputSnapshots.push(inputs.map((item) => item.id)),
  });

  await controller.connect(access);
  const firstHandler = input.onmidimessage;
  await controller.connect(access);
  input.emit([0x90, 64, 90], 100);

  assert.equal(input.openCount, 1);
  assert.equal(typeof firstHandler, "function");
  assert.equal(messages.length, 1);
  assert.deepEqual(inputSnapshots.at(-1), ["keyboard"]);
  controller.dispose();
  assert.equal(input.onmidimessage, null);
  assert.equal(access.onstatechange, null);
});

test("switching MIDI access detaches stale ports and callbacks", async () => {
  const oldInput = fakeInput("old");
  const nextInput = fakeInput("next");
  const oldAccess = fakeAccess([oldInput]);
  const nextAccess = fakeAccess([nextInput]);
  const messages = [];
  const controller = new MidiInputController({ onMessage: (message) => messages.push(message), onInputsChanged: () => {} });

  await controller.connect(oldAccess);
  await controller.connect(nextAccess);
  oldInput.emit([0x90, 60, 100], 10);
  nextInput.emit([0x90, 62, 100], 20);

  assert.equal(oldAccess.onstatechange, null);
  assert.equal(oldInput.onmidimessage, null);
  assert.deepEqual(messages.map((message) => message.note), [62]);
});

test("deduplicates mirrored hardware events without swallowing one port's repeats", async () => {
  const portA = fakeInput("port-a");
  const portB = fakeInput("port-b");
  const messages = [];
  const controller = new MidiInputController({ onMessage: (message) => messages.push(message), onInputsChanged: () => {} }, 4);
  await controller.connect(fakeAccess([portA, portB]));

  portA.emit([0x90, 67, 96], 100);
  portB.emit([0x90, 67, 96], 102);
  portA.emit([0x90, 67, 96], 103);
  portB.emit([0x90, 69, 96], 103);

  assert.deepEqual(messages.map((message) => message.note), [67, 67, 69]);
});
