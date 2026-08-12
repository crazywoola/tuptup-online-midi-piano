"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TARGET_DEVICE = "TupTup TS01-MIDI";
const LOWEST_NOTE = 48;
const HIGHEST_NOTE = 83;

const KEYBOARD_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

const KEY_HINTS = Object.fromEntries(
  Object.entries(KEYBOARD_MAP).map(([key, offset]) => [offset, key.toUpperCase()]),
);

type ConnectionState = "idle" | "searching" | "connected" | "missing" | "error";

type Voice = {
  oscillators: OscillatorNode[];
  gain: GainNode;
};

function noteName(note: number) {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

function isBlack(note: number) {
  return [1, 3, 6, 8, 10].includes(note % 12);
}

function noteFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

export default function Home() {
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState(TARGET_DEVICE);
  const [deviceDetail, setDeviceDetail] = useState("SoundWalker · USB MIDI");
  const [message, setMessage] = useState("等待连接");
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<number | null>(null);
  const [velocity, setVelocity] = useState(0);
  const [volume, setVolume] = useState(72);
  const [octave, setOctave] = useState(4);
  const [sustain, setSustainState] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const voicesRef = useRef(new Map<number, Voice>());
  const heldNotesRef = useRef(new Set<number>());
  const sustainedNotesRef = useRef(new Set<number>());
  const sustainRef = useRef(false);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiInputRef = useRef<MIDIInput | null>(null);
  const volumeRef = useRef(volume);

  const allNotes = useMemo(
    () => Array.from({ length: HIGHEST_NOTE - LOWEST_NOTE + 1 }, (_, index) => LOWEST_NOTE + index),
    [],
  );
  const whiteNotes = useMemo(() => allNotes.filter((note) => !isBlack(note)), [allNotes]);
  const blackNotes = useMemo(() => allNotes.filter(isBlack), [allNotes]);

  const refreshActiveNotes = useCallback(() => {
    setActiveNotes(new Set(voicesRef.current.keys()));
  }, []);

  const ensureAudio = useCallback(() => {
    let context = audioContextRef.current;
    if (!context) {
      context = new AudioContext({ latencyHint: "interactive" });
      const master = context.createGain();
      master.gain.value = (volumeRef.current / 100) * 0.55;
      master.connect(context.destination);
      audioContextRef.current = context;
      masterGainRef.current = master;
    }
    if (context.state === "suspended") void context.resume();
    return context;
  }, []);

  const releaseVoice = useCallback(
    (note: number, fast = false) => {
      const voice = voicesRef.current.get(note);
      const context = audioContextRef.current;
      if (!voice || !context) return;

      const now = context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, fast ? 0.018 : 0.11);
      voice.oscillators.forEach((oscillator) => oscillator.stop(now + (fast ? 0.1 : 0.6)));
      voicesRef.current.delete(note);
      refreshActiveNotes();
    },
    [refreshActiveNotes],
  );

  const playNote = useCallback(
    (note: number, noteVelocity = 96) => {
      const context = ensureAudio();
      const master = masterGainRef.current;
      if (!master) return;

      if (voicesRef.current.has(note)) releaseVoice(note, true);

      const now = context.currentTime;
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const frequency = noteFrequency(note);
      const strength = Math.max(0.08, noteVelocity / 127);
      const oscillators = [context.createOscillator(), context.createOscillator()];

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2400 + strength * 2800, now);
      filter.Q.value = 0.7;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.13 * strength, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.07 * strength, now + 0.55);

      oscillators[0].type = "triangle";
      oscillators[0].frequency.value = frequency;
      oscillators[1].type = "sine";
      oscillators[1].frequency.value = frequency * 2;
      oscillators[1].detune.value = 3;

      const overtoneGain = context.createGain();
      overtoneGain.gain.value = 0.18;
      oscillators[0].connect(filter);
      oscillators[1].connect(overtoneGain).connect(filter);
      filter.connect(gain).connect(master);
      oscillators.forEach((oscillator) => oscillator.start(now));

      voicesRef.current.set(note, { oscillators, gain });
      heldNotesRef.current.add(note);
      sustainedNotesRef.current.delete(note);
      setLastNote(note);
      setVelocity(noteVelocity);
      refreshActiveNotes();
    },
    [ensureAudio, refreshActiveNotes, releaseVoice],
  );

  const stopNote = useCallback(
    (note: number) => {
      heldNotesRef.current.delete(note);
      if (sustainRef.current) {
        sustainedNotesRef.current.add(note);
        return;
      }
      releaseVoice(note);
    },
    [releaseVoice],
  );

  const setSustain = useCallback(
    (enabled: boolean) => {
      sustainRef.current = enabled;
      setSustainState(enabled);
      if (!enabled) {
        sustainedNotesRef.current.forEach((note) => {
          if (!heldNotesRef.current.has(note)) releaseVoice(note);
        });
        sustainedNotesRef.current.clear();
      }
    },
    [releaseVoice],
  );

  const handleMidiMessage = useCallback(
    (event: MIDIMessageEvent) => {
      const [status = 0, note = 0, value = 0] = Array.from(event.data ?? []);
      const command = status & 0xf0;
      if (command === 0x90 && value > 0) playNote(note, value);
      if (command === 0x80 || (command === 0x90 && value === 0)) stopNote(note);
      if (command === 0xb0 && note === 64) setSustain(value >= 64);
    },
    [playNote, setSustain, stopNote],
  );

  const attachPreferredInput = useCallback(
    (access: MIDIAccess) => {
      const inputs = Array.from(access.inputs.values());
      const preferred = inputs.find(
        (input) =>
          input.name?.toLowerCase().includes("tuptup ts01") ||
          input.manufacturer?.toLowerCase().includes("soundwalker"),
      );
      const input = preferred ?? inputs[0];

      if (!input) {
        midiInputRef.current = null;
        setConnection("missing");
        setMessage("未发现 MIDI 输入，请检查 USB 连接");
        return;
      }

      if (midiInputRef.current && midiInputRef.current !== input) {
        midiInputRef.current.onmidimessage = null;
      }
      input.onmidimessage = handleMidiMessage;
      midiInputRef.current = input;
      setDeviceName(input.name || TARGET_DEVICE);
      setDeviceDetail(`${input.manufacturer || "SoundWalker"} · ${input.connection === "open" ? "MIDI 已打开" : "USB MIDI"}`);
      setConnection("connected");
      setMessage(preferred ? "已连接，开始演奏吧" : `已连接 ${input.name || "MIDI 键盘"}`);
      ensureAudio();
    },
    [ensureAudio, handleMidiMessage],
  );

  const connectMidi = useCallback(async () => {
    if (!("requestMIDIAccess" in navigator)) {
      setConnection("error");
      setMessage("此浏览器不支持 Web MIDI，请使用最新版 Chrome 或 Edge");
      return;
    }

    setConnection("searching");
    setMessage("正在请求 MIDI 权限…");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      attachPreferredInput(access);
      access.onstatechange = () => attachPreferredInput(access);
    } catch {
      setConnection("error");
      setMessage("未获得 MIDI 权限，请在浏览器中允许设备访问");
    }
  }, [attachPreferredInput]);

  useEffect(() => {
    volumeRef.current = volume;
    const master = masterGainRef.current;
    const context = audioContextRef.current;
    if (master && context) {
      master.gain.setTargetAtTime((volume / 100) * 0.55, context.currentTime, 0.025);
    }
  }, [volume]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        setSustain(true);
        return;
      }
      const offset = KEYBOARD_MAP[key];
      if (offset === undefined) return;
      event.preventDefault();
      playNote((octave + 1) * 12 + offset, 94);
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === " ") {
        setSustain(false);
        return;
      }
      const offset = KEYBOARD_MAP[key];
      if (offset !== undefined) stopNote((octave + 1) * 12 + offset);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [octave, playNote, setSustain, stopNote]);

  useEffect(
    () => () => {
      midiInputRef.current && (midiInputRef.current.onmidimessage = null);
      voicesRef.current.forEach((_, note) => releaseVoice(note, true));
      void audioContextRef.current?.close();
    },
    [releaseVoice],
  );

  const pointerDown = (note: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    playNote(note, 104);
  };
  const pointerUp = (note: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopNote(note);
  };

  const baseComputerNote = (octave + 1) * 12;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#piano" aria-label="TupTup Piano 首页">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>TUPTUP <b>PIANO</b></span>
        </a>
        <div className={`status-pill ${connection}`}>
          <span className="status-dot" />
          {connection === "connected" ? "MIDI ONLINE" : "MIDI OFFLINE"}
        </div>
      </header>

      <section className="hero" id="piano">
        <div className="hero-copy">
          <p className="eyebrow">ONLINE MIDI INSTRUMENT / 01</p>
          <h1>插上键盘，<br /><em>让声音发生。</em></h1>
          <p className="intro">专为你的 TupTup TS01-MIDI 打造。无需安装软件，浏览器就是乐器。</p>
        </div>

        <aside className="device-card">
          <div className="device-card-head">
            <span>YOUR DEVICE</span>
            <span className="usb-label">USB</span>
          </div>
          <div className="device-main">
            <div className="midi-port" aria-hidden="true"><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span></div>
            <div>
              <h2>{deviceName}</h2>
              <p>{deviceDetail}</p>
            </div>
          </div>
          <button className="connect-button" onClick={connectMidi} disabled={connection === "searching"}>
            <span>{connection === "connected" ? "重新连接" : connection === "searching" ? "正在连接" : "连接 MIDI 键盘"}</span>
            <span aria-hidden="true">↗</span>
          </button>
          <p className="connection-message">{message}</p>
        </aside>
      </section>

      <section className="instrument" aria-label="在线钢琴">
        <div className="instrument-top">
          <div className="readout">
            <span className="readout-label">NOTE</span>
            <strong>{lastNote === null ? "—" : noteName(lastNote)}</strong>
          </div>
          <div className="velocity">
            <div className="velocity-head"><span>VELOCITY</span><b>{String(velocity).padStart(3, "0")}</b></div>
            <div className="meter"><span style={{ width: `${(velocity / 127) * 100}%` }} /></div>
          </div>
          <label className="volume-control">
            <span><b>VOLUME</b><small>{volume}%</small></span>
            <input aria-label="音量" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          </label>
          <div className="octave-control" aria-label="电脑键盘八度">
            <span>OCTAVE</span>
            <div>
              <button onClick={() => setOctave((value) => Math.max(2, value - 1))} aria-label="降低八度">−</button>
              <b>{octave}</b>
              <button onClick={() => setOctave((value) => Math.min(6, value + 1))} aria-label="升高八度">＋</button>
            </div>
          </div>
          <div className={`sustain-indicator ${sustain ? "active" : ""}`}><span /> SUSTAIN</div>
        </div>

        <div className="keyboard-scroll">
          <div className="keyboard" role="group" aria-label="钢琴键盘，从 C3 到 B5">
            <div className="white-keys">
              {whiteNotes.map((note) => {
                const hint = KEY_HINTS[note - baseComputerNote];
                return (
                  <button
                    className={`piano-key white ${activeNotes.has(note) ? "active" : ""}`}
                    key={note}
                    onPointerDown={pointerDown(note)}
                    onPointerUp={pointerUp(note)}
                    onPointerCancel={pointerUp(note)}
                    aria-label={noteName(note)}
                  >
                    {hint && <kbd>{hint}</kbd>}
                    {note % 12 === 0 && <span>{noteName(note)}</span>}
                  </button>
                );
              })}
            </div>
            <div className="black-keys" aria-hidden="false">
              {blackNotes.map((note) => {
                const precedingWhites = whiteNotes.filter((whiteNote) => whiteNote < note).length;
                const hint = KEY_HINTS[note - baseComputerNote];
                return (
                  <button
                    className={`piano-key black ${activeNotes.has(note) ? "active" : ""}`}
                    style={{ left: `${(precedingWhites / whiteNotes.length) * 100}%`, width: `${(100 / whiteNotes.length) * 0.62}%` }}
                    key={note}
                    onPointerDown={pointerDown(note)}
                    onPointerUp={pointerUp(note)}
                    onPointerCancel={pointerUp(note)}
                    aria-label={noteName(note)}
                  >
                    {hint && <kbd>{hint}</kbd>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="instrument-foot">
          <p><span>电脑键盘</span> A–K 演奏 · 空格键延音</p>
          <p><span className="pulse" /> LOW-LATENCY AUDIO ENGINE</p>
        </div>
      </section>

      <footer>
        <p>WEB MIDI / WEB AUDIO</p>
        <p>CHROME OR EDGE RECOMMENDED</p>
        <p>MADE FOR <b>TUPTUP TS01</b></p>
      </footer>
    </main>
  );
}
