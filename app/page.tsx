"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TARGET_DEVICE = "TupTup TS01-MIDI";
const PUBLIC_SITE_URL = "https://tuptup-midi-piano.bananapink.chatgpt.site";
const LOWEST_NOTE = 36;
const HIGHEST_NOTE = 96;

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

type ConnectionState = "idle" | "searching" | "connected" | "missing" | "blocked" | "error";

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
  const [copyStatus, setCopyStatus] = useState("复制 Chrome 链接");

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const voicesRef = useRef(new Map<number, Voice>());
  const heldNotesRef = useRef(new Set<number>());
  const sustainedNotesRef = useRef(new Set<number>());
  const sustainRef = useRef(false);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiInputRef = useRef<MIDIInput | null>(null);
  const volumeRef = useRef(volume);
  const keyboardScrollRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);

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
    async (access: MIDIAccess) => {
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
      await input.open();
      input.onmidimessage = handleMidiMessage;
      midiInputRef.current = input;
      setDeviceName(input.name || TARGET_DEVICE);
      setDeviceDetail(`${input.manufacturer || "SoundWalker"} · ${input.connection === "open" ? "MIDI 已打开" : "USB MIDI"}`);
      setConnection("connected");
      setMessage(preferred ? "已连接，请按下实体 MIDI 键盘测试灯光" : `已连接 ${input.name || "MIDI 键盘"}`);
      ensureAudio();
    },
    [ensureAudio, handleMidiMessage],
  );

  const connectMidi = useCallback(async () => {
    if (!("requestMIDIAccess" in navigator)) {
      setConnection("error");
      setMessage("当前浏览器不支持 USB MIDI");
      return;
    }

    setConnection("searching");
    setMessage("正在请求 MIDI 权限…");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      await attachPreferredInput(access);
      access.onstatechange = () => {
        void attachPreferredInput(access).catch(() => {
          setConnection("missing");
          setMessage("MIDI 键盘已断开，请检查 USB 连接");
        });
      };
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "";
      const wasBlocked = errorName === "NotAllowedError" || errorName === "SecurityError";
      setConnection(wasBlocked ? "blocked" : "error");
      setMessage(wasBlocked ? "当前浏览器拒绝了 MIDI 设备权限" : "MIDI 连接失败，请重新插拔键盘后再试");
    }
  }, [attachPreferredInput]);

  const copyChromeLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_SITE_URL);
      setCopyStatus("已复制，粘贴到 Chrome");
      window.setTimeout(() => setCopyStatus("复制 Chrome 链接"), 2600);
    } catch {
      setCopyStatus("请手动复制下方网址");
    }
  }, []);

  useEffect(() => {
    volumeRef.current = volume;
    const master = masterGainRef.current;
    const context = audioContextRef.current;
    if (master && context) {
      master.gain.setTargetAtTime((volume / 100) * 0.55, context.currentTime, 0.025);
    }
  }, [volume]);

  useEffect(() => {
    const scrollArea = keyboardScrollRef.current;
    const focusNote = lastNote ?? 60;
    const key = scrollArea?.querySelector<HTMLElement>(`[data-note="${focusNote}"]`);
    if (!scrollArea || !key) return;

    const keyCenter = key.offsetLeft + key.offsetWidth / 2;
    const visibleLeft = scrollArea.scrollLeft;
    const visibleRight = visibleLeft + scrollArea.clientWidth;
    const isOutsideView = keyCenter < visibleLeft + 50 || keyCenter > visibleRight - 50;

    if (!initialScrollDoneRef.current || isOutsideView) {
      scrollArea.scrollTo({
        left: Math.max(0, keyCenter - scrollArea.clientWidth / 2),
        behavior: initialScrollDoneRef.current ? "smooth" : "instant",
      });
      initialScrollDoneRef.current = true;
    }
  }, [lastNote]);

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
          {(connection === "blocked" || connection === "error") && (
            <div className="browser-help" role="alert">
              <strong>请用桌面版 Chrome 或 Edge 打开</strong>
              <p>Codex 内置预览无法读取 USB MIDI。复制正式网址，在 Chrome 地址栏中打开，再点击连接并允许 MIDI 设备访问。</p>
              <button onClick={copyChromeLink}>{copyStatus}</button>
              <code>{PUBLIC_SITE_URL.replace("https://", "")}</code>
            </div>
          )}
        </aside>
      </section>

      <section
        className={`instrument ${activeNotes.size > 0 ? "playing" : ""}`}
        style={{ "--performance-energy": velocity / 127 } as React.CSSProperties}
        aria-label="在线钢琴"
      >
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

        <div className="feedback-strip" aria-live="polite">
          <div className="live-input">
            <span><i /> LIVE INPUT</span>
            <strong>{activeNotes.size > 0 && lastNote !== null ? `${noteName(lastNote)} 正在演奏` : "按下 MIDI 键盘，灯光会跟随音符"}</strong>
          </div>
          <div className="note-lights" aria-label="十二音视觉反馈">
            {Array.from({ length: 12 }, (_, pitch) => (
              <i
                className={Array.from(activeNotes).some((note) => note % 12 === pitch) ? "active" : ""}
                key={pitch}
                style={{ "--light-index": pitch } as React.CSSProperties}
              />
            ))}
          </div>
          <div className="energy-readout">
            <span>ACTIVE KEYS</span>
            <b>{String(activeNotes.size).padStart(2, "0")}</b>
          </div>
        </div>

        <div className="keyboard-scroll" ref={keyboardScrollRef}>
          <div className="keyboard" role="group" aria-label="61 键钢琴键盘，从 C2 到 C7">
            <div className="white-keys">
              {whiteNotes.map((note) => {
                const hint = KEY_HINTS[note - baseComputerNote];
                return (
                  <button
                    className={`piano-key white ${activeNotes.has(note) ? "active" : ""}`}
                    data-note={note}
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
                    data-note={note}
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
          <p><span>主要输入</span> TupTup USB MIDI · 电脑键盘仅作备用</p>
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
