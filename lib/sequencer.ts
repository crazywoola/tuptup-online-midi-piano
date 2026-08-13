import { PPQ, expandClipNotes, type ProjectDocumentV3 } from "./project";

export type ScheduledMidiEvent = {
  trackId: string;
  instrument: string;
  pitch: number;
  velocity: number;
  tick: number;
  durationTicks: number;
};

export function ticksToSeconds(ticks: number, bpm: number, ppq = PPQ) {
  return ticks / ppq * 60 / bpm;
}

export function secondsToTicks(seconds: number, bpm: number, ppq = PPQ) {
  return seconds * bpm / 60 * ppq;
}

export function normalizeLoopTick(tick: number, loop: ProjectDocumentV3["loop"]) {
  if (!loop.enabled || tick < loop.endTick) return tick;
  const length = Math.max(1, loop.endTick - loop.startTick);
  return loop.startTick + ((tick - loop.startTick) % length + length) % length;
}

export function collectPlaybackEvents(project: ProjectDocumentV3, fromTick: number, toTick: number) {
  const hasSolo = project.tracks.some((track) => track.solo);
  const result: ScheduledMidiEvent[] = [];
  for (const track of project.tracks) {
    if (track.mute || (hasSolo && !track.solo)) continue;
    for (const clip of track.clips) {
      if (clip.startTick >= toTick || clip.startTick + clip.displayLengthTicks <= fromTick) continue;
      for (const note of expandClipNotes(clip, fromTick, toTick)) {
        result.push({ trackId: track.id, instrument: track.instrument, pitch: note.pitch, velocity: note.velocity, tick: note.songTick, durationTicks: note.durationTicks });
      }
    }
  }
  return result.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
}

export type ScheduleSegment = { fromTick: number; toTick: number; secondsOffset: number };

export function scheduleSegments(project: ProjectDocumentV3, fromTick: number, tickSpan: number) {
  const loop = project.loop;
  if (!loop.enabled || fromTick + tickSpan <= loop.endTick) return [{ fromTick, toTick: fromTick + tickSpan, secondsOffset: 0 }];
  const result: ScheduleSegment[] = [];
  let cursor = fromTick;
  let remaining = tickSpan;
  let consumed = 0;
  while (remaining > 0) {
    const untilBoundary = Math.max(0, loop.endTick - cursor);
    const length = Math.min(remaining, untilBoundary || remaining);
    result.push({ fromTick: cursor, toTick: cursor + length, secondsOffset: ticksToSeconds(consumed, project.bpm, project.ppq) });
    remaining -= length;
    consumed += length;
    cursor = remaining > 0 ? loop.startTick : cursor + length;
  }
  return result;
}

export function advanceTransportTick(project: ProjectDocumentV3, fromTick: number, tickSpan: number) {
  if (!project.loop.enabled || fromTick + tickSpan < project.loop.endTick) return fromTick + tickSpan;
  return normalizeLoopTick(fromTick + tickSpan, project.loop);
}
