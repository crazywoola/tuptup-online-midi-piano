import {
  PPQ,
  STEP_TICKS,
  barTicks,
  clampMidi,
  createClip,
  expandClipNotes,
  projectUid,
  requiredSongBars,
  type InstrumentDefaults,
  type MidiTrackV3,
  type ProjectDocumentV3,
  type TimeSignature,
} from "./project";
import type { InstrumentId } from "./soundfont";

function writeVlq(value: number) {
  const bytes = [value & 0x7f];
  while ((value >>= 7)) bytes.unshift((value & 0x7f) | 0x80);
  return bytes;
}

function intBytes(value: number, count: number) {
  return Array.from({ length: count }, (_, index) => (value >> ((count - index - 1) * 8)) & 0xff);
}

function chunk(name: string, data: number[]) {
  return [...Array.from(name).map((letter) => letter.charCodeAt(0)), ...intBytes(data.length, 4), ...data];
}

function textMeta(type: number, value: string) {
  const data = Array.from(new TextEncoder().encode(value)).slice(0, 127);
  return [0x00, 0xff, type, ...writeVlq(data.length), ...data];
}

export function makeProjectMidi(project: ProjectDocumentV3) {
  const tempo = Math.round(60_000_000 / project.bpm);
  const denominatorPower = Math.max(0, Math.round(Math.log2(project.timeSignature.denominator)));
  const tempoData = [
    0x00, 0xff, 0x51, 0x03, ...intBytes(tempo, 3),
    0x00, 0xff, 0x58, 0x04, project.timeSignature.numerator, denominatorPower, 0x18, 0x08,
    0x00, 0xff, 0x2f, 0x00,
  ];
  const songEnd = project.lengthBars * barTicks(project.timeSignature, project.ppq);
  const midiTracks = project.tracks.map((track) => {
    const channel = track.instrument === "drums" || track.instrument === "chinesePercussion" ? 9 : Math.max(0, Math.min(15, track.channel));
    const notes = track.clips.flatMap((clip) => expandClipNotes(clip, 0, songEnd));
    const events = notes.flatMap((note) => [
      { tick: note.songTick, order: 1, data: [0x90 | channel, clampMidi(note.pitch), clampMidi(note.velocity)] },
      { tick: note.songTick + Math.max(1, note.durationTicks), order: 0, data: [0x80 | channel, clampMidi(note.pitch), 0] },
    ]).sort((a, b) => a.tick - b.tick || a.order - b.order);
    let previous = 0;
    const bytes = [...textMeta(0x03, track.name), 0x00, 0xc0 | channel, clampMidi(track.program)];
    for (const event of events) {
      bytes.push(...writeVlq(event.tick - previous), ...event.data);
      previous = event.tick;
    }
    bytes.push(0x00, 0xff, 0x2f, 0x00);
    return chunk("MTrk", bytes);
  });
  const header = chunk("MThd", [0x00, 0x01, ...intBytes(midiTracks.length + 1, 2), ...intBytes(project.ppq, 2)]);
  return new Uint8Array([...header, ...chunk("MTrk", tempoData), ...midiTracks.flat()]);
}

type ProgramItem = { id: InstrumentId; program: number; color: string; name: string };

export function parseMidiFile(buffer: ArrayBuffer, programs: ProgramItem[], defaults: InstrumentDefaults) {
  const data = new Uint8Array(buffer);
  const text = (offset: number, length: number) => String.fromCharCode(...data.slice(offset, offset + length));
  const readInt = (offset: number, length: number) => data.slice(offset, offset + length).reduce((total, byte) => total * 256 + byte, 0);
  if (data.length < 14 || text(0, 4) !== "MThd") throw new Error("Not a MIDI file");
  const division = readInt(12, 2);
  if (division & 0x8000) throw new Error("SMPTE MIDI timing is not supported");
  let offset = 8 + readInt(4, 4);
  let bpm = 112;
  let signature: TimeSignature = { numerator: 4, denominator: 4 };
  let maxTick = 0;
  const tracks: MidiTrackV3[] = [];
  while (offset + 8 <= data.length && tracks.length < 128) {
    const chunkName = text(offset, 4);
    const length = readInt(offset + 4, 4);
    const end = Math.min(data.length, offset + 8 + length);
    offset += 8;
    if (chunkName !== "MTrk") { offset = end; continue; }
    let tick = 0;
    let running = 0;
    let trackName = "";
    const channelPrograms = Array.from({ length: 16 }, () => 0);
    const notesByChannel = new Map<number, MidiTrackV3["clips"][number]["notes"]>();
    const active = new Map<string, Array<{ tick: number; velocity: number }>>();
    const readVariable = () => {
      let value = 0;
      let byte = 0;
      let guard = 0;
      do {
        if (offset >= end || guard++ > 4) throw new Error("Invalid MIDI variable length value");
        byte = data[offset++];
        value = (value << 7) | (byte & 0x7f);
      } while (byte & 0x80);
      return value;
    };
    while (offset < end) {
      tick += readVariable();
      maxTick = Math.max(maxTick, tick);
      let status = data[offset];
      if (status & 0x80) {
        offset += 1;
        running = status < 0xf0 ? status : 0;
      } else {
        status = running;
        if (!status) throw new Error("Invalid MIDI running status");
      }
      if (status === 0xff) {
        const type = data[offset++];
        const size = readVariable();
        if (offset + size > end) break;
        if (type === 0x51 && size === 3) bpm = Math.round(60_000_000 / readInt(offset, 3));
        if (type === 0x58 && size >= 2) {
          const denominator = 2 ** data[offset + 1];
          if ([2, 4, 8, 16].includes(denominator)) signature = { numerator: Math.max(1, Math.min(12, data[offset])), denominator: denominator as TimeSignature["denominator"] };
        }
        if (type === 0x03) trackName = new TextDecoder().decode(data.slice(offset, offset + size));
        offset += size;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { offset += readVariable(); continue; }
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const first = data[offset++];
      const second = command === 0xc0 || command === 0xd0 ? 0 : data[offset++];
      if (command === 0xc0) channelPrograms[channel] = first;
      const key = `${channel}:${first}`;
      if (command === 0x90 && second > 0) {
        const stack = active.get(key) ?? [];
        stack.push({ tick, velocity: second });
        active.set(key, stack);
      } else if (command === 0x80 || (command === 0x90 && second === 0)) {
        const stack = active.get(key);
        const start = stack?.shift();
        if (!start) continue;
        const scale = PPQ / division;
        const startTick = Math.max(0, Math.round(start.tick * scale));
        const endTick = Math.max(startTick + 1, Math.round(tick * scale));
        const notes = notesByChannel.get(channel) ?? [];
        notes.push({ id: projectUid("note"), pitch: clampMidi(first), tick: startTick, durationTicks: endTick - startTick, velocity: clampMidi(start.velocity) });
        notesByChannel.set(channel, notes);
      }
    }
    for (const [key, starts] of active) {
      const [channelText, pitchText] = key.split(":");
      const channel = Number(channelText);
      const pitch = Number(pitchText);
      const notes = notesByChannel.get(channel) ?? [];
      for (const start of starts) {
        const scale = PPQ / division;
        const startTick = Math.max(0, Math.round(start.tick * scale));
        const endTick = Math.max(startTick + 1, Math.round(tick * scale));
        notes.push({ id: projectUid("note"), pitch: clampMidi(pitch), tick: startTick, durationTicks: endTick - startTick, velocity: clampMidi(start.velocity) });
      }
      notesByChannel.set(channel, notes);
    }
    const populatedChannels = [...notesByChannel.entries()].filter(([, notes]) => notes.length);
    for (const [channel, notes] of populatedChannels) {
      if (tracks.length >= 128) break;
      const program = channelPrograms[channel];
      const isDrum = channel === 9;
      const instrument = isDrum
        ? programs.find((item) => item.id === "drums") ?? programs[0]
        : programs.reduce((best, item) => Math.abs(item.program - program) < Math.abs(best.program - program) ? item : best, programs[0]);
      const noteEnd = notes.reduce((endTick, note) => Math.max(endTick, note.tick + note.durationTicks), STEP_TICKS);
      const contentLength = Math.max(barTicks(signature), Math.ceil(noteEnd / barTicks(signature)) * barTicks(signature));
      tracks.push({
        id: projectUid("track"), name: populatedChannels.length > 1 ? `${trackName || "IMPORTED"} · CH ${channel + 1}` : trackName || `IMPORTED ${tracks.length + 1}`, instrument: instrument.id, color: instrument.color,
        program: isDrum ? defaults.drums.program : program, channel, volume: 76, pan: 0, reverb: 18,
        mute: false, solo: false, arm: tracks.length === 0, clips: [createClip(0, contentLength, trackName || "IMPORTED MIDI", notes)],
      });
    }
    offset = end;
  }
  if (!tracks.length) throw new Error("No note data found");
  const projectShape: Pick<ProjectDocumentV3, "lengthBars" | "timeSignature" | "ppq"> = { lengthBars: 16, timeSignature: signature, ppq: PPQ };
  const scaledEnd = Math.round(maxTick * PPQ / division);
  return { tracks, bpm: Math.max(40, Math.min(240, bpm)), timeSignature: signature, lengthBars: requiredSongBars(projectShape, scaledEnd) };
}
