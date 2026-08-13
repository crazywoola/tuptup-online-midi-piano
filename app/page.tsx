"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TARGET_DEVICE = "TupTup TS01-MIDI";
const PUBLIC_SITE_URL = "https://tuptup-midi-studio.bananapink.chatgpt.site";
const LOOP_STEPS = 32;
const KEYBOARD_LOW = 36;
const KEYBOARD_HIGH = 96;
const EDITOR_LOW = 48;
const EDITOR_HIGH = 83;
const STORAGE_KEY = "tuptup-studio-project-v2";

const KEYBOARD_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

type ConnectionState = "idle" | "searching" | "connected" | "missing" | "blocked" | "error";
type ModalName = "new-track" | "audio" | "shortcuts" | "export" | null;
type InstrumentId = "grand" | "electric" | "pad" | "bass" | "lead" | "organ" | "marimba" | "strings" | "drums";

type Instrument = {
  id: InstrumentId;
  name: string;
  family: string;
  icon: string;
  color: string;
  wave: OscillatorType;
  overtone: OscillatorType;
  attack: number;
  release: number;
  cutoff: number;
  program: number;
};

type NoteEvent = {
  id: string;
  note: number;
  start: number;
  duration: number;
  velocity: number;
};

type Track = {
  id: string;
  name: string;
  instrument: InstrumentId;
  color: string;
  volume: number;
  pan: number;
  reverb: number;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  notes: NoteEvent[];
};

type Voice = {
  oscillators: OscillatorNode[];
  gain: GainNode;
  release: number;
};

const INSTRUMENTS: Instrument[] = [
  { id: "grand", name: "Studio Grand", family: "钢琴", icon: "♩", color: "#9df564", wave: "triangle", overtone: "sine", attack: .008, release: .7, cutoff: 5200, program: 0 },
  { id: "electric", name: "Velvet Keys", family: "电钢", icon: "⌁", color: "#63d7ff", wave: "sine", overtone: "triangle", attack: .012, release: .9, cutoff: 4200, program: 4 },
  { id: "pad", name: "Aurora Pad", family: "合成器", icon: "≈", color: "#b69cff", wave: "sawtooth", overtone: "triangle", attack: .32, release: 1.5, cutoff: 1700, program: 89 },
  { id: "bass", name: "Deep Mono", family: "贝斯", icon: "≋", color: "#ffbb55", wave: "square", overtone: "sawtooth", attack: .01, release: .35, cutoff: 1100, program: 38 },
  { id: "lead", name: "Neon Lead", family: "合成器", icon: "⌁", color: "#ff6c8f", wave: "sawtooth", overtone: "square", attack: .018, release: .28, cutoff: 3600, program: 81 },
  { id: "organ", name: "Moon Organ", family: "风琴", icon: "Ⅱ", color: "#f5e663", wave: "sine", overtone: "square", attack: .02, release: .5, cutoff: 4800, program: 16 },
  { id: "marimba", name: "Glass Marimba", family: "打击乐", icon: "◇", color: "#57e0ba", wave: "sine", overtone: "sine", attack: .004, release: .42, cutoff: 7000, program: 12 },
  { id: "strings", name: "Warm Ensemble", family: "弦乐", icon: "〰", color: "#ef9dff", wave: "sawtooth", overtone: "triangle", attack: .16, release: 1.2, cutoff: 2300, program: 48 },
  { id: "drums", name: "Pulse Kit", family: "鼓组", icon: "●", color: "#ff7a52", wave: "square", overtone: "sine", attack: .002, release: .2, cutoff: 6200, program: 0 },
];

const INITIAL_TRACKS: Track[] = [
  {
    id: "track-keys", name: "VELVET KEYS", instrument: "electric", color: "#63d7ff", volume: 78, pan: -8, reverb: 22, mute: false, solo: false, arm: true,
    notes: [
      [60, 0, 4, 96], [64, 0, 4, 88], [67, 0, 4, 91], [62, 4, 4, 92], [65, 4, 4, 86], [69, 4, 4, 90],
      [59, 8, 4, 93], [62, 8, 4, 87], [67, 8, 4, 91], [60, 12, 4, 96], [64, 12, 4, 89], [67, 12, 4, 92],
      [60, 16, 4, 94], [64, 16, 4, 88], [67, 16, 4, 90], [62, 20, 4, 91], [65, 20, 4, 84], [69, 20, 4, 88],
      [59, 24, 4, 92], [62, 24, 4, 85], [67, 24, 4, 89], [60, 28, 4, 98], [64, 28, 4, 90], [67, 28, 4, 94],
    ].map(([note, start, duration, velocity], i) => ({ id: `keys-${i}`, note, start, duration, velocity })),
  },
  {
    id: "track-bass", name: "DEEP MONO", instrument: "bass", color: "#ffbb55", volume: 72, pan: 0, reverb: 8, mute: false, solo: false, arm: false,
    notes: [[36, 0, 3, 108], [38, 4, 3, 102], [35, 8, 3, 105], [36, 12, 3, 110], [36, 16, 3, 106], [38, 20, 3, 101], [35, 24, 3, 104], [36, 28, 3, 112]].map(([note, start, duration, velocity], i) => ({ id: `bass-${i}`, note, start, duration, velocity })),
  },
  {
    id: "track-pad", name: "AURORA PAD", instrument: "pad", color: "#b69cff", volume: 58, pan: 18, reverb: 48, mute: false, solo: false, arm: false,
    notes: [[48, 0, 8, 74], [53, 8, 8, 70], [55, 16, 8, 73], [48, 24, 8, 76]].map(([note, start, duration, velocity], i) => ({ id: `pad-${i}`, note, start, duration, velocity })),
  },
  {
    id: "track-drums", name: "PULSE KIT", instrument: "drums", color: "#ff7a52", volume: 82, pan: 0, reverb: 14, mute: false, solo: false, arm: false,
    notes: Array.from({ length: 16 }, (_, i) => ({ id: `hat-${i}`, note: i % 4 === 0 ? 36 : i % 4 === 2 ? 38 : 42, start: i * 2, duration: 1, velocity: i % 4 === 0 ? 114 : 84 })),
  },
];

const KEY_HINTS = Object.fromEntries(Object.entries(KEYBOARD_MAP).map(([key, offset]) => [offset, key.toUpperCase()]));

function noteName(note: number) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

function isBlack(note: number) {
  return [1, 3, 6, 8, 10].includes(note % 12);
}

function noteFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function instrumentById(id: InstrumentId) {
  return INSTRUMENTS.find((instrument) => instrument.id === id) ?? INSTRUMENTS[0];
}

function uid(prefix = "note") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneTracks(tracks: Track[]) {
  return tracks.map((track) => ({ ...track, notes: track.notes.map((note) => ({ ...note })) }));
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

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

function makeMidi(tracks: Track[], bpm: number) {
  const ppq = 480;
  const stepTicks = ppq / 4;
  const tempo = Math.round(60000000 / bpm);
  const tempoData = [0x00, 0xff, 0x51, 0x03, ...intBytes(tempo, 3), 0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08, 0x00, 0xff, 0x2f, 0x00];
  const midiTracks = tracks.map((track, trackIndex) => {
    const channel = track.instrument === "drums" ? 9 : trackIndex % 9;
    const program = instrumentById(track.instrument).program;
    const events = track.notes.flatMap((note) => [
      { tick: note.start * stepTicks, order: 1, data: [0x90 | channel, note.note, note.velocity] },
      { tick: (note.start + note.duration) * stepTicks, order: 0, data: [0x80 | channel, note.note, 0] },
    ]).sort((a, b) => a.tick - b.tick || a.order - b.order);
    let previous = 0;
    const bytes = [0x00, 0xc0 | channel, program];
    events.forEach((event) => {
      bytes.push(...writeVlq(event.tick - previous), ...event.data);
      previous = event.tick;
    });
    bytes.push(0x00, 0xff, 0x2f, 0x00);
    return chunk("MTrk", bytes);
  });
  const header = chunk("MThd", [0x00, 0x01, ...intBytes(midiTracks.length + 1, 2), ...intBytes(ppq, 2)]);
  return new Uint8Array([...header, ...chunk("MTrk", tempoData), ...midiTracks.flat()]);
}

function parseMidi(buffer: ArrayBuffer): { tracks: Track[]; bpm?: number } {
  const data = new Uint8Array(buffer);
  const text = (offset: number, length: number) => String.fromCharCode(...data.slice(offset, offset + length));
  const readInt = (offset: number, length: number) => data.slice(offset, offset + length).reduce((total, byte) => total * 256 + byte, 0);
  if (text(0, 4) !== "MThd") throw new Error("Not a MIDI file");
  const division = readInt(12, 2) || 480;
  let offset = 8 + readInt(4, 4);
  let foundBpm: number | undefined;
  const parsed: Track[] = [];
  while (offset + 8 <= data.length) {
    const name = text(offset, 4);
    const length = readInt(offset + 4, 4);
    const end = offset + 8 + length;
    offset += 8;
    if (name !== "MTrk") { offset = end; continue; }
    let tick = 0;
    let running = 0;
    let program = 0;
    const notes: NoteEvent[] = [];
    const active = new Map<string, { tick: number; velocity: number }[]>();
    const readVariable = () => {
      let value = 0;
      let byte = 0;
      do { byte = data[offset++]; value = (value << 7) | (byte & 0x7f); } while (byte & 0x80);
      return value;
    };
    while (offset < end) {
      tick += readVariable();
      let status = data[offset];
      if (status & 0x80) { running = status; offset += 1; } else { status = running; }
      if (status === 0xff) {
        const type = data[offset++];
        const size = readVariable();
        if (type === 0x51 && size === 3) foundBpm = Math.round(60000000 / readInt(offset, 3));
        offset += size;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { offset += readVariable(); continue; }
      const command = status & 0xf0;
      const channel = status & 0x0f;
      const first = data[offset++];
      const second = command === 0xc0 || command === 0xd0 ? 0 : data[offset++];
      if (command === 0xc0) program = first;
      const key = `${channel}:${first}`;
      if (command === 0x90 && second > 0) {
        const stack = active.get(key) ?? [];
        stack.push({ tick, velocity: second });
        active.set(key, stack);
      } else if (command === 0x80 || (command === 0x90 && second === 0)) {
        const stack = active.get(key);
        const start = stack?.shift();
        if (start) {
          const startStep = Math.round(start.tick / (division / 4));
          const duration = Math.max(1, Math.round((tick - start.tick) / (division / 4)));
          notes.push({ id: uid("import"), note: first, start: startStep % LOOP_STEPS, duration: Math.min(duration, LOOP_STEPS), velocity: start.velocity });
        }
      }
    }
    if (notes.length) {
      const instrument = INSTRUMENTS.reduce((best, item) => Math.abs(item.program - program) < Math.abs(best.program - program) ? item : best, INSTRUMENTS[0]);
      parsed.push({ id: uid("track"), name: `IMPORTED ${parsed.length + 1}`, instrument: instrument.id, color: instrument.color, volume: 76, pan: 0, reverb: 18, mute: false, solo: false, arm: parsed.length === 0, notes });
    }
    offset = end;
  }
  if (!parsed.length) throw new Error("No note data found");
  return { tracks: parsed.slice(0, 12), bpm: foundBpm };
}

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [selectedTrackId, setSelectedTrackId] = useState(INITIAL_TRACKS[0].id);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [history, setHistory] = useState<Track[][]>([]);
  const [future, setFuture] = useState<Track[][]>([]);
  const [bpm, setBpm] = useState(112);
  const [octave, setOctave] = useState(4);
  const [masterVolume, setMasterVolume] = useState(78);
  const [metronome, setMetronome] = useState(true);
  const [looping, setLooping] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [countIn, setCountIn] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState(TARGET_DEVICE);
  const [deviceMessage, setDeviceMessage] = useState("尚未连接硬件；电脑键盘可直接演奏");
  const [midiEventCount, setMidiEventCount] = useState(0);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<number | null>(null);
  const [lastVelocity, setLastVelocity] = useState(0);
  const [voiceCount, setVoiceCount] = useState(0);
  const [sustain, setSustainState] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [deviceDrawer, setDeviceDrawer] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"library" | "mixer" | null>(null);
  const [toast, setToast] = useState("");
  const [projectName, setProjectName] = useState("MIDNIGHT SKETCH");

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const voicesRef = useRef(new Map<string, Voice>());
  const liveVoiceKeysRef = useRef(new Map<number, string>());
  const heldNotesRef = useRef(new Set<number>());
  const sustainedNotesRef = useRef(new Set<number>());
  const sustainRef = useRef(false);
  const midiInputsRef = useRef<Map<string, MIDIInput>>(new Map());
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const tracksRef = useRef(tracks);
  const bpmRef = useRef(bpm);
  const metroRef = useRef(metronome);
  const loopRef = useRef(looping);
  const currentStepRef = useRef(currentStep);
  const recordingRef = useRef(isRecording);
  const recordStartsRef = useRef(new Map<number, { step: number; trackId: string }>());
  const toastTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const allKeyboardNotes = useMemo(() => Array.from({ length: KEYBOARD_HIGH - KEYBOARD_LOW + 1 }, (_, i) => KEYBOARD_LOW + i), []);
  const whiteNotes = useMemo(() => allKeyboardNotes.filter((note) => !isBlack(note)), [allKeyboardNotes]);
  const blackNotes = useMemo(() => allKeyboardNotes.filter(isBlack), [allKeyboardNotes]);
  const editorNotes = useMemo(() => Array.from({ length: EDITOR_HIGH - EDITOR_LOW + 1 }, (_, i) => EDITOR_HIGH - i), []);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];
  const selectedInstrument = instrumentById(selectedTrack?.instrument ?? "grand");
  const selectedNote = selectedTrack?.notes.find((note) => note.id === selectedNoteId) ?? null;
  const measure = Math.floor(currentStep / 16) + 1;
  const beat = Math.floor((currentStep % 16) / 4) + 1;
  const subdivision = (currentStep % 4) + 1;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  const commitTracks = useCallback((updater: (current: Track[]) => Track[]) => {
    setTracks((current) => {
      const next = updater(current);
      if (next === current) return current;
      setHistory((items) => [...items.slice(-29), cloneTracks(current)]);
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setTracks((current) => {
        setFuture((redo) => [cloneTracks(current), ...redo].slice(0, 30));
        return cloneTracks(previous);
      });
      return items.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setTracks((current) => {
        setHistory((undoItems) => [...undoItems.slice(-29), cloneTracks(current)]);
        return cloneTracks(next);
      });
      return items.slice(1);
    });
  }, []);

  const ensureAudio = useCallback(() => {
    let context = audioContextRef.current;
    if (!context) {
      context = new AudioContext({ latencyHint: "interactive" });
      const master = context.createGain();
      master.gain.value = masterVolume / 100 * .7;
      master.connect(context.destination);
      audioContextRef.current = context;
      masterGainRef.current = master;
    }
    if (context.state === "suspended") void context.resume();
    return context;
  }, [masterVolume]);

  const stopVoice = useCallback((key: string, fast = false) => {
    const voice = voicesRef.current.get(key);
    const context = audioContextRef.current;
    if (!voice || !context) return;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(.0001, now, fast ? .012 : Math.max(.03, voice.release / 4));
    voice.oscillators.forEach((oscillator) => {
      try { oscillator.stop(now + (fast ? .08 : voice.release)); } catch { /* already stopped */ }
    });
    voicesRef.current.delete(key);
    setVoiceCount(voicesRef.current.size);
  }, []);

  const triggerNote = useCallback((note: number, velocity = 96, trackId = selectedTrackId, source: "live" | "sequence" = "live", durationSeconds?: number) => {
    const track = tracksRef.current.find((item) => item.id === trackId) ?? tracksRef.current[0];
    if (!track || track.mute || (tracksRef.current.some((item) => item.solo) && !track.solo)) return "";
    const context = ensureAudio();
    const master = masterGainRef.current;
    if (!master) return "";
    if (source === "live") {
      const prior = liveVoiceKeysRef.current.get(note);
      if (prior) stopVoice(prior, true);
    }
    const preset = instrumentById(track.instrument);
    const key = `${source}-${trackId}-${note}-${context.currentTime}-${Math.random()}`;
    const now = context.currentTime;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const oscillators = [context.createOscillator(), context.createOscillator()];
    const strength = Math.max(.06, velocity / 127);
    const baseFrequency = preset.id === "drums" ? (note === 36 ? 74 : note === 38 ? 185 : 430) : noteFrequency(note);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(preset.cutoff * (.62 + strength * .52), now);
    filter.Q.value = preset.id === "bass" ? 4.2 : .8;
    panner.pan.value = track.pan / 100;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime((preset.id === "pad" ? .06 : .11) * strength * track.volume / 100, now + preset.attack);
    gain.gain.exponentialRampToValueAtTime((preset.id === "drums" ? .0002 : .045) * strength * track.volume / 100, now + (preset.id === "drums" ? .16 : Math.max(.28, preset.attack + .4)));
    oscillators[0].type = preset.wave;
    oscillators[0].frequency.setValueAtTime(baseFrequency, now);
    oscillators[1].type = preset.overtone;
    oscillators[1].frequency.setValueAtTime(baseFrequency * (preset.id === "organ" ? 2 : preset.id === "drums" ? 1.65 : 2), now);
    oscillators[1].detune.value = preset.id === "pad" || preset.id === "strings" ? 9 : 2;
    const overtoneGain = context.createGain();
    overtoneGain.gain.value = preset.id === "organ" ? .42 : preset.id === "marimba" ? .34 : .17;
    oscillators[0].connect(filter);
    oscillators[1].connect(overtoneGain).connect(filter);
    filter.connect(gain).connect(panner).connect(master);
    oscillators.forEach((oscillator) => oscillator.start(now));
    voicesRef.current.set(key, { oscillators, gain, release: preset.release });
    setVoiceCount(voicesRef.current.size);
    if (source === "live") {
      liveVoiceKeysRef.current.set(note, key);
      heldNotesRef.current.add(note);
      setActiveNotes((notes) => new Set(notes).add(note));
      setLastNote(note);
      setLastVelocity(velocity);
      if (recordingRef.current) recordStartsRef.current.set(note, { step: currentStepRef.current, trackId });
    } else if (durationSeconds) {
      window.setTimeout(() => stopVoice(key), durationSeconds * 1000);
    }
    return key;
  }, [ensureAudio, selectedTrackId, stopVoice]);

  const releaseLiveNote = useCallback((note: number) => {
    heldNotesRef.current.delete(note);
    const key = liveVoiceKeysRef.current.get(note);
    if (!key) return;
    if (sustainRef.current) {
      sustainedNotesRef.current.add(note);
    } else {
      stopVoice(key);
      liveVoiceKeysRef.current.delete(note);
      setActiveNotes((notes) => { const next = new Set(notes); next.delete(note); return next; });
    }
    const recordStart = recordStartsRef.current.get(note);
    if (recordStart) {
      const rawDuration = (currentStepRef.current - recordStart.step + LOOP_STEPS) % LOOP_STEPS;
      const event: NoteEvent = { id: uid(), note, start: recordStart.step, duration: Math.max(1, rawDuration), velocity: lastVelocity || 96 };
      commitTracks((current) => current.map((track) => track.id === recordStart.trackId ? { ...track, notes: [...track.notes, event] } : track));
      recordStartsRef.current.delete(note);
    }
  }, [commitTracks, lastVelocity, stopVoice]);

  const setSustain = useCallback((enabled: boolean) => {
    sustainRef.current = enabled;
    setSustainState(enabled);
    if (!enabled) {
      sustainedNotesRef.current.forEach((note) => {
        if (heldNotesRef.current.has(note)) return;
        const key = liveVoiceKeysRef.current.get(note);
        if (key) stopVoice(key);
        liveVoiceKeysRef.current.delete(note);
      });
      sustainedNotesRef.current.clear();
      setActiveNotes(new Set(heldNotesRef.current));
    }
  }, [stopVoice]);

  const clickMetronome = useCallback((accent: boolean) => {
    const context = ensureAudio();
    const master = masterGainRef.current;
    if (!master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = accent ? 1320 : 920;
    gain.gain.setValueAtTime(.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .045);
    oscillator.connect(gain).connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + .05);
  }, [ensureAudio]);

  const stopTransport = useCallback(() => {
    setIsPlaying(false);
    setIsRecording(false);
    recordingRef.current = false;
    recordStartsRef.current.clear();
    voicesRef.current.forEach((_, key) => { if (key.startsWith("sequence-")) stopVoice(key, true); });
  }, [stopVoice]);

  const togglePlay = useCallback(() => {
    ensureAudio();
    setIsPlaying((playing) => !playing);
  }, [ensureAudio]);

  const toggleRecord = useCallback(() => {
    ensureAudio();
    setIsRecording((recording) => {
      const next = !recording;
      recordingRef.current = next;
      if (next) setIsPlaying(true);
      notify(next ? (countIn ? "预备拍开启 · 开始录音" : "录音已开始") : "录音已停止");
      return next;
    });
  }, [countIn, ensureAudio, notify]);

  const connectMidi = useCallback(async () => {
    if (!("requestMIDIAccess" in navigator)) {
      setConnection("error");
      setDeviceMessage("当前浏览器不支持 Web MIDI，请使用桌面版 Chrome 或 Edge");
      return;
    }
    setConnection("searching");
    setDeviceMessage("正在请求 MIDI 设备权限…");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      const attachInputs = async () => {
        midiInputsRef.current.forEach((input) => { input.onmidimessage = null; });
        const inputs = Array.from(access.inputs.values());
        if (!inputs.length) {
          midiInputsRef.current.clear();
          setConnection("missing");
          setDeviceMessage("未发现 MIDI 输入，请检查 USB 连接");
          return;
        }
        const opened = (await Promise.all(inputs.map(async (input) => {
          try {
            await input.open();
            input.onmidimessage = (event) => {
              const [status = 0, note = 0, value = 0] = Array.from(event.data ?? []);
              const command = status & 0xf0;
              setMidiEventCount((count) => count + 1);
              if (command === 0x90 && value > 0) triggerNote(note, value);
              if (command === 0x80 || (command === 0x90 && value === 0)) releaseLiveNote(note);
              if (command === 0xb0 && note === 64) setSustain(value >= 64);
            };
            return input;
          } catch { return null; }
        }))).filter((input): input is MIDIInput => input !== null);
        if (!opened.length) throw new Error("No MIDI input opened");
        midiInputsRef.current = new Map(opened.map((input) => [input.id, input]));
        const primary = opened.find((input) => input.name?.toLowerCase().includes("tuptup") || input.name?.toLowerCase().includes("sam5704")) ?? opened[0];
        setDeviceName(primary.name || TARGET_DEVICE);
        setConnection("connected");
        setDeviceMessage(`${opened.length} 个输入端口在线 · 通道全开`);
        ensureAudio();
        notify("MIDI 键盘已连接");
      };
      await attachInputs();
      access.onstatechange = () => { void attachInputs(); };
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "";
      setConnection(errorName === "NotAllowedError" || errorName === "SecurityError" ? "blocked" : "error");
      setDeviceMessage("连接失败；请允许 MIDI 权限后重试");
    }
  }, [ensureAudio, notify, releaseLiveNote, setSustain, triggerNote]);

  const addTrack = useCallback((instrumentId: InstrumentId) => {
    const instrument = instrumentById(instrumentId);
    const track: Track = { id: uid("track"), name: instrument.name.toUpperCase(), instrument: instrument.id, color: instrument.color, volume: 76, pan: 0, reverb: 18, mute: false, solo: false, arm: true, notes: [] };
    commitTracks((current) => [...current.map((item) => ({ ...item, arm: false })), track]);
    setSelectedTrackId(track.id);
    setSelectedNoteId(null);
    setModal(null);
    notify(`${instrument.name} 音轨已创建`);
  }, [commitTracks, notify]);

  const updateTrack = useCallback((trackId: string, patch: Partial<Track>, withHistory = false) => {
    const update = (current: Track[]) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track);
    if (withHistory) commitTracks(update); else setTracks(update);
  }, [commitTracks]);

  const setArmedTrack = useCallback((trackId: string) => {
    setTracks((current) => current.map((track) => ({ ...track, arm: track.id === trackId ? !track.arm : false })));
    setSelectedTrackId(trackId);
  }, []);

  const deleteSelectedTrack = useCallback(() => {
    if (tracks.length <= 1 || !selectedTrack) return;
    const index = tracks.findIndex((track) => track.id === selectedTrack.id);
    const fallback = tracks[Math.max(0, index - 1)];
    commitTracks((current) => current.filter((track) => track.id !== selectedTrack.id));
    setSelectedTrackId(fallback.id);
    setSelectedNoteId(null);
    notify("音轨已删除 · 可撤销");
  }, [commitTracks, notify, selectedTrack, tracks]);

  const changeInstrument = useCallback((instrumentId: InstrumentId) => {
    const instrument = instrumentById(instrumentId);
    updateTrack(selectedTrackId, { instrument: instrumentId, color: instrument.color, name: instrument.name.toUpperCase() }, true);
  }, [selectedTrackId, updateTrack]);

  const addEditorNote = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".roll-note")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const step = Math.min(LOOP_STEPS - 1, Math.floor((event.clientX - bounds.left) / bounds.width * LOOP_STEPS));
    const row = Math.min(editorNotes.length - 1, Math.floor((event.clientY - bounds.top) / bounds.height * editorNotes.length));
    const note: NoteEvent = { id: uid(), note: editorNotes[row], start: step, duration: 2, velocity: 96 };
    commitTracks((current) => current.map((track) => track.id === selectedTrackId ? { ...track, notes: [...track.notes, note] } : track));
    setSelectedNoteId(note.id);
  }, [commitTracks, editorNotes, selectedTrackId]);

  const editSelectedNotes = useCallback((operation: "quantize" | "humanize" | "duplicate" | "delete" | "left" | "right" | "up" | "down") => {
    if (!selectedTrack) return;
    commitTracks((current) => current.map((track) => {
      if (track.id !== selectedTrack.id) return track;
      if (operation === "delete") return { ...track, notes: track.notes.filter((note) => selectedNoteId ? note.id !== selectedNoteId : false) };
      if (operation === "duplicate") {
        const source = track.notes.find((note) => note.id === selectedNoteId);
        if (!source) return track;
        const copy = { ...source, id: uid(), start: (source.start + source.duration) % LOOP_STEPS };
        setSelectedNoteId(copy.id);
        return { ...track, notes: [...track.notes, copy] };
      }
      return {
        ...track,
        notes: track.notes.map((note) => {
          if (selectedNoteId && note.id !== selectedNoteId) return note;
          if (operation === "quantize") return { ...note, start: Math.round(note.start), duration: Math.max(1, Math.round(note.duration)) };
          if (operation === "humanize") return { ...note, velocity: Math.max(35, Math.min(127, note.velocity + Math.round((Math.random() - .5) * 14))) };
          if (operation === "left") return { ...note, start: Math.max(0, note.start - 1) };
          if (operation === "right") return { ...note, start: Math.min(LOOP_STEPS - note.duration, note.start + 1) };
          if (operation === "up") return { ...note, note: Math.min(127, note.note + 1) };
          if (operation === "down") return { ...note, note: Math.max(0, note.note - 1) };
          return note;
        }),
      };
    }));
    if (operation === "delete") setSelectedNoteId(null);
  }, [commitTracks, selectedNoteId, selectedTrack]);

  const newProject = useCallback(() => {
    stopTransport();
    setTracks(cloneTracks(INITIAL_TRACKS).map((track) => ({ ...track, notes: [] })));
    setSelectedTrackId(INITIAL_TRACKS[0].id);
    setHistory([]);
    setFuture([]);
    setCurrentStep(0);
    currentStepRef.current = 0;
    setProjectName("UNTITLED SESSION");
    notify("新工程已创建");
  }, [notify, stopTransport]);

  const saveProject = useCallback(() => {
    const project = { version: 2, name: projectName, bpm, masterVolume, tracks };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    notify("工程已保存到此设备");
  }, [bpm, masterVolume, notify, projectName, tracks]);

  const exportProject = useCallback((type: "midi" | "json") => {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tuptup-session";
    if (type === "midi") downloadBlob(new Blob([makeMidi(tracks, bpm)], { type: "audio/midi" }), `${safeName}.mid`);
    else downloadBlob(new Blob([JSON.stringify({ version: 2, name: projectName, bpm, masterVolume, tracks }, null, 2)], { type: "application/json" }), `${safeName}.tuptup.json`);
    notify(type === "midi" ? "MIDI 已导出" : "工程包已导出");
    setModal(null);
  }, [bpm, masterVolume, notify, projectName, tracks]);

  const importMidi = useCallback(async (file: File) => {
    try {
      const parsed = parseMidi(await file.arrayBuffer());
      stopTransport();
      setHistory((items) => [...items.slice(-29), cloneTracks(tracksRef.current)]);
      setTracks(parsed.tracks);
      setSelectedTrackId(parsed.tracks[0].id);
      if (parsed.bpm) setBpm(Math.max(40, Math.min(240, parsed.bpm)));
      setProjectName(file.name.replace(/\.midi?$/i, "").toUpperCase());
      notify(`已导入 ${parsed.tracks.length} 条 MIDI 音轨`);
    } catch {
      notify("无法读取此 MIDI 文件");
    }
  }, [notify, stopTransport]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metroRef.current = metronome; }, [metronome]);
  useEffect(() => { loopRef.current = looping; }, [looping]);
  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);
  useEffect(() => { recordingRef.current = isRecording; }, [isRecording]);

  useEffect(() => {
    const master = masterGainRef.current;
    const context = audioContextRef.current;
    if (master && context) master.gain.setTargetAtTime(masterVolume / 100 * .7, context.currentTime, .025);
  }, [masterVolume]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const project = JSON.parse(stored) as { name?: string; bpm?: number; masterVolume?: number; tracks?: Track[] };
        if (project.tracks?.length) {
          setTracks(project.tracks);
          setSelectedTrackId(project.tracks[0].id);
        }
        if (project.name) setProjectName(project.name);
        if (project.bpm) setBpm(project.bpm);
        if (project.masterVolume !== undefined) setMasterVolume(project.masterVolume);
      } catch { /* ignore damaged local draft */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let timer = 0;
    let nextAt = performance.now();
    const schedule = () => {
      const step = currentStepRef.current;
      const stepSeconds = 60 / bpmRef.current / 4;
      const audibleTracks = tracksRef.current.filter((track) => !track.mute && (!tracksRef.current.some((item) => item.solo) || track.solo));
      if (metroRef.current && step % 4 === 0) clickMetronome(step % 16 === 0);
      audibleTracks.forEach((track) => track.notes.filter((note) => note.start === step).forEach((note) => {
        triggerNote(note.note, note.velocity, track.id, "sequence", note.duration * stepSeconds * .92);
      }));
      const next = step + 1;
      if (next >= LOOP_STEPS && !loopRef.current) {
        setCurrentStep(LOOP_STEPS - 1);
        currentStepRef.current = LOOP_STEPS - 1;
        stopTransport();
        return;
      }
      currentStepRef.current = next % LOOP_STEPS;
      setCurrentStep(currentStepRef.current);
      nextAt += stepSeconds * 1000;
      timer = window.setTimeout(schedule, Math.max(0, nextAt - performance.now()));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [clickMetronome, isPlaying, stopTransport, triggerNote]);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if ((event.metaKey || event.ctrlKey) && key === "s") { event.preventDefault(); saveProject(); return; }
      if (event.key === " ") { event.preventDefault(); if (!event.repeat) togglePlay(); return; }
      if (key === "r" && !event.repeat) { event.preventDefault(); toggleRecord(); return; }
      if (key === "m" && !event.repeat) { event.preventDefault(); setMetronome((value) => !value); return; }
      if (event.key === "Shift") { setSustain(true); return; }
      if (event.key === "Backspace" || event.key === "Delete") { if (selectedNoteId) { event.preventDefault(); editSelectedNotes("delete"); } return; }
      const offset = KEYBOARD_MAP[key];
      if (offset !== undefined && !event.repeat) { event.preventDefault(); triggerNote((octave + 1) * 12 + offset, 98); }
    };
    const up = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.key === "Shift") { setSustain(false); return; }
      const offset = KEYBOARD_MAP[event.key.toLowerCase()];
      if (offset !== undefined) releaseLiveNote((octave + 1) * 12 + offset);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [editSelectedNotes, octave, redo, releaseLiveNote, saveProject, selectedNoteId, setSustain, togglePlay, toggleRecord, triggerNote, undo]);

  useEffect(() => () => {
    midiInputsRef.current.forEach((input) => { input.onmidimessage = null; });
    voicesRef.current.forEach((_, key) => stopVoice(key, true));
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    void audioContextRef.current?.close();
  }, [stopVoice]);

  const pointerDown = (note: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    triggerNote(note, 104);
  };
  const pointerUp = (note: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    releaseLiveNote(note);
  };

  const setPlayhead = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const step = Math.max(0, Math.min(LOOP_STEPS - 1, Math.floor((event.clientX - bounds.left) / bounds.width * LOOP_STEPS)));
    currentStepRef.current = step;
    setCurrentStep(step);
  };

  const baseComputerNote = (octave + 1) * 12;

  return (
    <main className="studio-shell">
      <header className="app-header">
        <button className="brand" onClick={() => notify("TupTup Studio · 浏览器 MIDI 工作站")} aria-label="TupTup Studio">
          <span className="brand-emblem" aria-hidden="true"><i /><i /><i /></span>
          <span><b>TUPTUP</b><small>STUDIO</small></span>
        </button>
        <div className="project-title">
          <span>PROJECT</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value.toUpperCase())} aria-label="工程名称" />
          <i aria-hidden="true">●</i>
        </div>
        <nav className="header-actions" aria-label="工程操作">
          <button onClick={newProject}>新建</button>
          <button onClick={() => importInputRef.current?.click()}>导入 MIDI</button>
          <button onClick={saveProject}>保存</button>
          <button className="accent-button" onClick={() => setModal("export")}>导出</button>
          <button className={`device-button ${connection === "connected" ? "online" : ""}`} onClick={() => setDeviceDrawer(true)}>
            <i /> {connection === "connected" ? "MIDI 在线" : "连接设备"}
          </button>
        </nav>
        <input ref={importInputRef} className="visually-hidden" type="file" accept=".mid,.midi,audio/midi" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importMidi(file); event.currentTarget.value = ""; }} />
      </header>

      <section className="transport" aria-label="传输控制">
        <div className="transport-left">
          <button className="mobile-toggle" onClick={() => setMobilePanel("library")} aria-label="打开音色库">☰</button>
          <button onClick={undo} disabled={!history.length} aria-label="撤销">↶</button>
          <button onClick={redo} disabled={!future.length} aria-label="重做">↷</button>
          <span className="transport-divider" />
          <button className={metronome ? "active-control" : ""} onClick={() => setMetronome((value) => !value)} aria-pressed={metronome} title="节拍器 (M)">⌁<small>CLICK</small></button>
          <label className="tempo-control"><span>TEMPO</span><input type="number" min="40" max="240" value={bpm} onChange={(event) => setBpm(Math.max(40, Math.min(240, Number(event.target.value) || 40)))} /><b>BPM</b></label>
          <button className={countIn ? "active-control" : ""} onClick={() => setCountIn((value) => !value)} title="预备拍">1·2</button>
        </div>
        <div className="transport-center">
          <button onClick={() => { currentStepRef.current = 0; setCurrentStep(0); }} aria-label="回到开头">|◀</button>
          <button className="play-button" onClick={togglePlay} aria-label={isPlaying ? "暂停" : "播放"}>{isPlaying ? "Ⅱ" : "▶"}</button>
          <button className={`record-button ${isRecording ? "recording" : ""}`} onClick={toggleRecord} aria-label={isRecording ? "停止录音" : "录音"}><i /></button>
          <div className="time-display"><strong>{measure}.{beat}.{subdivision}</strong><span>BAR · BEAT · STEP</span></div>
        </div>
        <div className="transport-right">
          <button className={looping ? "active-control" : ""} onClick={() => setLooping((value) => !value)} aria-pressed={looping}>↻<small>LOOP</small></button>
          <label className="master-control"><span>MASTER</span><input type="range" min="0" max="100" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} /><b>{masterVolume}</b></label>
          <button onClick={() => setModal("audio")} aria-label="音频设置">⚙</button>
          <button className="mobile-toggle" onClick={() => setMobilePanel("mixer")} aria-label="打开混音器">◫</button>
        </div>
      </section>

      <section className="workspace">
        <aside className={`library-panel ${mobilePanel === "library" ? "mobile-open" : ""}`}>
          <div className="panel-heading"><div><span>BROWSER</span><strong>音色与音轨</strong></div><button className="panel-close" onClick={() => setMobilePanel(null)}>×</button></div>
          <div className="library-tabs"><button className="selected">音色</button><button onClick={() => notify("采样库可在工程包中管理")}>采样</button><button onClick={() => notify("效果器位于右侧通道条")}>效果</button></div>
          <div className="instrument-library">
            {INSTRUMENTS.map((instrument) => (
              <button key={instrument.id} className={selectedTrack?.instrument === instrument.id ? "selected" : ""} onClick={() => changeInstrument(instrument.id)}>
                <i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrument.name}</strong><small>{instrument.family}</small></span><b>›</b>
              </button>
            ))}
          </div>
          <div className="track-list-heading"><span>TRACKS · {tracks.length}</span><button onClick={() => setModal("new-track")}>＋</button></div>
          <div className="compact-track-list">
            {tracks.map((track, index) => (
              <button key={track.id} className={track.id === selectedTrackId ? "selected" : ""} onClick={() => { setSelectedTrackId(track.id); setSelectedNoteId(null); setMobilePanel(null); }}>
                <span className="track-number">{String(index + 1).padStart(2, "0")}</span><i style={{ background: track.color }} /><span>{track.name}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="center-stage">
          <div className="arrangement-panel">
            <div className="section-bar">
              <div><span>ARRANGEMENT</span><strong>编曲时间线</strong></div>
              <div className="editing-tools">
                <button className="selected" title="选择工具">↖</button><button title="铅笔工具">✎</button><button title="切割工具">／</button>
                <span />
                <label>GRID <select aria-label="网格精度"><option>1/16</option><option>1/8</option><option>1/4</option></select></label>
                <button onClick={() => setModal("shortcuts")}>?</button>
              </div>
            </div>
            <div className="arrangement-scroll">
              <div className="ruler-row">
                <div className="track-label-header"><span>TRACK</span><button onClick={() => setModal("new-track")}>＋ ADD</button></div>
                <div className="ruler-grid" onPointerDown={setPlayhead}>
                  {Array.from({ length: 8 }, (_, i) => <span key={i} style={{ left: `${i * 12.5}%` }}>{i < 4 ? `1.${i + 1}` : `2.${i - 3}`}</span>)}
                  <i className="loop-range" />
                </div>
              </div>
              <div className="track-lanes">
                <div className="playhead" style={{ left: `calc(228px + (100% - 228px) * ${currentStep / LOOP_STEPS})` }}><i /><span /></div>
                {tracks.map((track, index) => (
                  <div className={`track-lane ${track.id === selectedTrackId ? "selected" : ""}`} key={track.id}>
                    <div className="track-label" role="button" tabIndex={0} onClick={() => { setSelectedTrackId(track.id); setSelectedNoteId(null); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedTrackId(track.id); setSelectedNoteId(null); } }}>
                      <span className="track-index" style={{ color: track.color }}>{String(index + 1).padStart(2, "0")}</span>
                      <i className="track-color" style={{ background: track.color }} />
                      <div><strong>{track.name}</strong><small>{instrumentById(track.instrument).family} · CH {index + 1}</small></div>
                      <button className={track.mute ? "engaged" : ""} onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { mute: !track.mute }); }}>M</button>
                      <button className={track.solo ? "engaged solo" : ""} onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }}>S</button>
                      <button className={track.arm ? "armed" : ""} onClick={(event) => { event.stopPropagation(); setArmedTrack(track.id); }}>●</button>
                    </div>
                    <div className="lane-grid" onPointerDown={setPlayhead}>
                      <div className="clip-block" style={{ borderColor: track.color, background: `color-mix(in srgb, ${track.color} 17%, #15171d)` }}>
                        <span>{track.name} · {track.notes.length} NOTES</span>
                        {track.notes.map((note) => (
                          <i key={note.id} style={{ left: `${note.start / LOOP_STEPS * 100}%`, width: `${Math.max(1, note.duration) / LOOP_STEPS * 100}%`, top: `${12 + ((84 - note.note + 120) % 7) * 4}px`, background: track.color }} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <button className="add-lane" onClick={() => setModal("new-track")}>＋ 添加乐器音轨</button>
              </div>
            </div>
          </div>

          <div className="piano-roll-panel">
            <div className="editor-toolbar">
              <div><span>PIANO ROLL</span><strong>{selectedTrack?.name}</strong></div>
              <div>
                <button onClick={() => editSelectedNotes("quantize")}>量化 1/16</button>
                <button onClick={() => editSelectedNotes("humanize")}>人性化</button>
                <button onClick={() => editSelectedNotes("duplicate")} disabled={!selectedNote}>重复</button>
                <button onClick={() => editSelectedNotes("delete")} disabled={!selectedNote}>删除</button>
                <span className="velocity-chip">VEL {selectedNote?.velocity ?? "—"}</span>
              </div>
            </div>
            <div className="roll-body">
              <div className="roll-key-labels" aria-hidden="true">
                {editorNotes.map((note) => <span className={isBlack(note) ? "black" : ""} key={note}>{note % 12 === 0 ? noteName(note) : ""}</span>)}
              </div>
              <div className="roll-grid" onPointerDown={addEditorNote} aria-label="钢琴卷帘，点击空白处添加音符">
                {Array.from({ length: LOOP_STEPS }, (_, i) => <i key={i} className={i % 4 === 0 ? "beat" : ""} style={{ left: `${i / LOOP_STEPS * 100}%` }} />)}
                {editorNotes.map((note, i) => <span key={note} className={isBlack(note) ? "black-row" : ""} style={{ top: `${i / editorNotes.length * 100}%`, height: `${100 / editorNotes.length}%` }} />)}
                <div className="roll-playhead" style={{ left: `${currentStep / LOOP_STEPS * 100}%` }} />
                {selectedTrack?.notes.filter((note) => note.note >= EDITOR_LOW && note.note <= EDITOR_HIGH).map((note) => (
                  <button key={note.id} className={`roll-note ${selectedNoteId === note.id ? "selected" : ""}`} style={{ left: `${note.start / LOOP_STEPS * 100}%`, width: `${Math.max(1, note.duration) / LOOP_STEPS * 100}%`, top: `${(EDITOR_HIGH - note.note) / editorNotes.length * 100}%`, height: `${100 / editorNotes.length}%`, background: selectedTrack.color }} onPointerDown={(event) => { event.stopPropagation(); setSelectedNoteId(note.id); }} onDoubleClick={() => { setSelectedNoteId(note.id); editSelectedNotes("delete"); }} aria-label={`${noteName(note.note)}，第 ${note.start + 1} 格`} />
                ))}
              </div>
            </div>
          </div>

          <div className="performance-panel">
            <div className="performance-strip">
              <div><span>LIVE INPUT</span><strong>{selectedInstrument.name}</strong><small>{connection === "connected" ? deviceName : "COMPUTER KEYS A–K"}</small></div>
              <div className="note-monitor"><b>{lastNote === null ? "—" : noteName(lastNote)}</b><span>NOTE</span></div>
              <div className="velocity-monitor"><span>VELOCITY <b>{String(lastVelocity).padStart(3, "0")}</b></span><i><b style={{ width: `${lastVelocity / 127 * 100}%` }} /></i></div>
              <div className="octave-switch"><span>OCTAVE</span><button onClick={() => setOctave((value) => Math.max(2, value - 1))}>−</button><b>{octave}</b><button onClick={() => setOctave((value) => Math.min(6, value + 1))}>＋</button></div>
              <div className={`sustain-light ${sustain ? "active" : ""}`}><i />SUSTAIN<small>SHIFT</small></div>
            </div>
            <div className="keyboard-scroll">
              <div className="keyboard" role="group" aria-label="共享 61 键演奏键盘">
                <div className="white-keys">
                  {whiteNotes.map((note) => {
                    const hint = KEY_HINTS[note - baseComputerNote];
                    return <button className={`piano-key white ${activeNotes.has(note) ? "active" : ""}`} key={note} onPointerDown={pointerDown(note)} onPointerUp={pointerUp(note)} onPointerCancel={pointerUp(note)} aria-label={noteName(note)}>{hint && <kbd>{hint}</kbd>}{note % 12 === 0 && <span>{noteName(note)}</span>}</button>;
                  })}
                </div>
                <div className="black-keys">
                  {blackNotes.map((note) => {
                    const precedingWhites = whiteNotes.filter((white) => white < note).length;
                    const hint = KEY_HINTS[note - baseComputerNote];
                    return <button className={`piano-key black ${activeNotes.has(note) ? "active" : ""}`} style={{ left: `${precedingWhites / whiteNotes.length * 100}%`, width: `${100 / whiteNotes.length * .62}%` }} key={note} onPointerDown={pointerDown(note)} onPointerUp={pointerUp(note)} onPointerCancel={pointerUp(note)} aria-label={noteName(note)}>{hint && <kbd>{hint}</kbd>}</button>;
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className={`mixer-panel ${mobilePanel === "mixer" ? "mobile-open" : ""}`}>
          <div className="panel-heading"><div><span>CHANNEL STRIP</span><strong>音轨混音</strong></div><button className="panel-close" onClick={() => setMobilePanel(null)}>×</button></div>
          <div className="channel-identity"><i style={{ background: selectedTrack?.color }} /> <div><span>SELECTED TRACK</span><input value={selectedTrack?.name ?? ""} onChange={(event) => updateTrack(selectedTrackId, { name: event.target.value.toUpperCase() })} aria-label="音轨名称" /></div><b>{String(tracks.findIndex((track) => track.id === selectedTrackId) + 1).padStart(2, "0")}</b></div>
          <div className="mixer-section"><span>INSTRUMENT</span><select value={selectedTrack?.instrument} onChange={(event) => changeInstrument(event.target.value as InstrumentId)}>{INSTRUMENTS.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.name}</option>)}</select></div>
          <div className="insert-list"><span>INSERTS</span><button><i>01</i><b>COMPRESSOR</b><em>ON</em></button><button><i>02</i><b>3-BAND EQ</b><em>ON</em></button><button onClick={() => notify("空插槽已就绪")}><i>03</i><b>EMPTY SLOT</b><em>＋</em></button></div>
          <div className="send-section"><span>SENDS</span><div><label><b>REVERB</b><input type="range" min="0" max="100" value={selectedTrack?.reverb ?? 0} onChange={(event) => updateTrack(selectedTrackId, { reverb: Number(event.target.value) })} /><small>{selectedTrack?.reverb}%</small></label><label><b>DELAY</b><input type="range" min="0" max="100" defaultValue="12" /><small>12%</small></label></div></div>
          <div className="channel-controls">
            <label><span>PAN</span><input type="range" min="-100" max="100" value={selectedTrack?.pan ?? 0} onChange={(event) => updateTrack(selectedTrackId, { pan: Number(event.target.value) })} /><b>{selectedTrack?.pan === 0 ? "C" : selectedTrack && selectedTrack.pan < 0 ? `L${Math.abs(selectedTrack.pan)}` : `R${selectedTrack?.pan}`}</b></label>
            <div className="fader-wrap"><div className="meter-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><input className="vertical-fader" type="range" min="0" max="100" value={selectedTrack?.volume ?? 0} onChange={(event) => updateTrack(selectedTrackId, { volume: Number(event.target.value) })} /><div className="db-scale"><span>0</span><span>-6</span><span>-12</span><span>-24</span><span>-∞</span></div></div>
            <div className="channel-buttons"><button className={selectedTrack?.mute ? "engaged" : ""} onClick={() => updateTrack(selectedTrackId, { mute: !selectedTrack?.mute })}>MUTE</button><button className={selectedTrack?.solo ? "engaged solo" : ""} onClick={() => updateTrack(selectedTrackId, { solo: !selectedTrack?.solo })}>SOLO</button><button className={selectedTrack?.arm ? "armed" : ""} onClick={() => setArmedTrack(selectedTrackId)}>● ARM</button></div>
          </div>
          <button className="delete-track" disabled={tracks.length <= 1} onClick={deleteSelectedTrack}>删除当前音轨</button>
        </aside>
      </section>

      <footer className="status-bar"><span><i className={connection === "connected" ? "online" : ""} /> AUDIO ENGINE · 48 KHZ</span><span>POLYPHONY {voiceCount}/64</span><span>MIDI RX {String(midiEventCount).padStart(4, "0")}</span><span>AUTOSAVE · LOCAL</span><span className="cpu">CPU <i><b style={{ width: `${Math.min(90, 12 + voiceCount * 6)}%` }} /></i></span></footer>

      {deviceDrawer && <div className="scrim" onPointerDown={() => setDeviceDrawer(false)} />}
      <aside className={`device-drawer ${deviceDrawer ? "open" : ""}`} aria-hidden={!deviceDrawer}>
        <div className="drawer-head"><div><span>HARDWARE</span><strong>MIDI 设备</strong></div><button onClick={() => setDeviceDrawer(false)}>×</button></div>
        <div className={`device-hero ${connection}`}><div className="midi-port"><i /><i /><i /><i /><i /></div><div><span>{connection === "connected" ? "CONNECTED" : "READY TO CONNECT"}</span><strong>{deviceName}</strong><p>{deviceMessage}</p></div></div>
        <button className="primary-action" onClick={connectMidi} disabled={connection === "searching"}>{connection === "searching" ? "正在搜索设备…" : connection === "connected" ? "重新扫描 MIDI 输入" : "连接 MIDI 键盘"}</button>
        <div className="device-info"><div><span>INPUT MODE</span><b>OMNI · ALL CHANNELS</b></div><div><span>LATENCY</span><b>INTERACTIVE</b></div><div><span>DATA PRIVACY</span><b>LOCAL ONLY</b></div></div>
        {(connection === "blocked" || connection === "error") && <div className="device-warning"><strong>需要桌面版 Chrome 或 Edge</strong><p>内置预览可能无法访问 USB。请在受支持的浏览器打开正式站点并允许 MIDI 权限。</p><button onClick={() => { void navigator.clipboard.writeText(PUBLIC_SITE_URL); notify("站点链接已复制"); }}>复制站点链接</button></div>}
        <div className="midi-map"><span>CONTROLLER MAP</span><p><kbd>CC 64</kbd> Sustain pedal</p><p><kbd>Note</kbd> Play selected track</p><p><kbd>Shift</kbd> Computer sustain</p></div>
      </aside>

      {modal && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className={`modal-card modal-${modal}`} role="dialog" aria-modal="true" aria-label={modal}>
          <button className="modal-close" onClick={() => setModal(null)}>×</button>
          {modal === "new-track" && <><div className="modal-title"><span>ADD TRACK</span><h2>选择你的下一件乐器</h2><p>所有音轨共享下方键盘，选中哪条就演奏哪种声音。</p></div><div className="instrument-grid">{INSTRUMENTS.map((instrument) => <button key={instrument.id} onClick={() => addTrack(instrument.id)}><i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrument.name}</strong><small>{instrument.family}</small></span><b>＋</b></button>)}</div></>}
          {modal === "audio" && <><div className="modal-title"><span>SETTINGS</span><h2>音频与录音设置</h2><p>为浏览器内的低延迟演奏优化。</p></div><div className="settings-list"><div><span><strong>音频缓冲</strong><small>延迟越低，CPU 占用越高</small></span><select aria-label="音频缓冲"><option>128 samples · 2.7 ms</option><option>256 samples · 5.3 ms</option><option>512 samples · 10.7 ms</option></select></div><div><span><strong>采样率</strong><small>当前音频上下文</small></span><select aria-label="采样率"><option>48 kHz</option><option>44.1 kHz</option></select></div><div><span><strong>录音预备拍</strong><small>录音前播放一小节节拍</small></span><input aria-label="录音预备拍" type="checkbox" checked={countIn} onChange={(event) => setCountIn(event.target.checked)} /></div><div><span><strong>循环录音</strong><small>持续覆盖 2 小节循环区域</small></span><input aria-label="循环录音" type="checkbox" checked={looping} onChange={(event) => setLooping(event.target.checked)} /></div></div><button className="primary-action" onClick={() => setModal(null)}>完成</button></>}
          {modal === "shortcuts" && <><div className="modal-title"><span>KEY COMMANDS</span><h2>把双手留给音乐</h2><p>电脑键盘与 MIDI 键盘可同时使用。</p></div><div className="shortcut-grid"><div><kbd>Space</kbd><span>播放 / 暂停</span></div><div><kbd>R</kbd><span>开始 / 停止录音</span></div><div><kbd>M</kbd><span>节拍器</span></div><div><kbd>Shift</kbd><span>延音踏板</span></div><div><kbd>A – K</kbd><span>演奏当前音色</span></div><div><kbd>⌘ Z</kbd><span>撤销编辑</span></div><div><kbd>Delete</kbd><span>删除选中音符</span></div><div><kbd>⌘ S</kbd><span>保存到本机</span></div></div></>}
          {modal === "export" && <><div className="modal-title"><span>BOUNCE & SHARE</span><h2>带走你的作品</h2><p>{tracks.length} 条音轨 · {tracks.reduce((count, track) => count + track.notes.length, 0)} 个音符 · {bpm} BPM</p></div><div className="export-options"><button onClick={() => exportProject("midi")}><i>.MID</i><span><strong>标准 MIDI 文件</strong><small>兼容 Logic、Ableton、Cubase 与大多数硬件</small></span><b>下载 ↗</b></button><button onClick={() => exportProject("json")}><i>.JSON</i><span><strong>TupTup 工程包</strong><small>保留音色、混音、速度和所有音轨数据</small></span><b>下载 ↗</b></button></div><p className="privacy-note">所有演奏与导出均在此设备完成，不会上传音乐数据。</p></>}
        </section>
      </div>}

      {mobilePanel && <button className="mobile-scrim" onClick={() => setMobilePanel(null)} aria-label="关闭面板" />}
      {toast && <div className="toast" role="status"><i />{toast}</div>}
    </main>
  );
}
