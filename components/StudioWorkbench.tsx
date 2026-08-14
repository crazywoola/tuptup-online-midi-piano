"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dataUrlToArrayBuffer,
  decodeSoundfontAnchors,
  fetchSoundfontText,
  nearestSoundfontEntry,
  parseMidiJsSoundfont,
  SAMPLE_SOURCES,
  type InstrumentId,
  type SampleSource,
  type SampleStatus,
  type SoundfontEntry,
} from "@/lib/soundfont";
import {
  GRID_VALUES,
  PPQ,
  STEP_TICKS,
  barTicks,
  cloneProject,
  createClip,
  createEmptyProject,
  generateRandomNotes,
  generateStyledArrangement,
  migrateProjectV2,
  normalizeProjectV3,
  projectContentEnd,
  projectUid,
  randomizeNoteValues,
  requiredSongBars,
  snapTick,
  songEndTick,
  splitClip,
  tickToBarBeat,
  type GridValue,
  type ArrangementStyleId,
  type ArrangementStyleMode,
  type InstrumentDefaults,
  type LegacyTrackV2,
  type MidiClipV3,
  type MidiNoteV3,
  type MidiTrackV3,
  type ProjectDocumentV3,
  type SongSectionRole,
} from "@/lib/project";
import { loadLastProjectDocument, saveProjectDocument } from "@/lib/project-store";
import { makeProjectMidi, parseMidiFile } from "@/lib/midi";
import { MidiInputController } from "@/lib/midi-input";
import { advanceTransportTick, collectPlaybackEvents, scheduleSegments, secondsToTicks, ticksToSeconds } from "@/lib/sequencer";
import { AudioBufferLru } from "@/lib/audio-buffer-lru";

const TARGET_DEVICE = "TupTup TS01-MIDI";
const PUBLIC_SITE_URL = "https://tuptup-midi-studio.bananapink.chatgpt.site";
const KEYBOARD_LOW = 36;
const KEYBOARD_HIGH = 96;
const EDITOR_LOW = KEYBOARD_LOW;
const EDITOR_HIGH = KEYBOARD_HIGH;
const LEGACY_STORAGE_KEY = "tuptup-studio-project-v2";
const LOCALE_STORAGE_KEY = "tuptup-studio-locale";
const ONBOARDING_STORAGE_KEY = "tuptup-studio-onboarding-v2";

const KEYBOARD_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

type ConnectionState = "idle" | "searching" | "connected" | "missing" | "blocked" | "error";
type Locale = "zh" | "en";
type DeviceMessageKind = "idle" | "searching" | "connected" | "missing" | "unsupported" | "failed";
type ModalName = "new-track" | "random-song" | "audio" | "shortcuts" | "export" | "samples" | "sound-check" | null;

type Instrument = {
  id: InstrumentId;
  name: string;
  family: string;
  nameZh: string;
  nameEn: string;
  familyZh: string;
  familyEn: string;
  icon: string;
  color: string;
  wave: OscillatorType;
  overtone: OscillatorType;
  attack: number;
  release: number;
  cutoff: number;
  program: number;
  collection?: "chinese";
  sample: SampleSource;
};

const UI_TEXT = {
  zh: {
    project: "工程", projectName: "工程名称", projectActions: "工程操作", newProject: "新建", importMidi: "导入 MIDI", save: "保存", export: "导出", midiOnline: "MIDI 在线", connectDevice: "连接设备",
    language: "语言", switchLanguage: "切换到 English", guide: "说明书", openGuide: "打开功能说明书", transport: "传输控制", openLibrary: "打开音色库", undo: "撤销", redo: "重做", metronome: "节拍器", tempo: "速度", countIn: "预备拍", returnStart: "回到开头", pause: "暂停", play: "播放", stopRecording: "停止录音", record: "录音", loop: "循环", master: "主音量", audioSettings: "音频设置", openMixer: "打开混音器",
    browser: "浏览器", libraryTitle: "音色库", tones: "音色", samples: "采样", effects: "效果", sampleLibraryManaged: "采样库可在工程包中管理", effectsInChannel: "效果器位于右侧通道条", studioCollection: "录音室", chineseCollection: "国风采样", credits: "来源", fullSuite: "整套", tracks: "音轨", ready: "采样就绪", loading: "采样加载中", synthFallback: "合成回退", loadOnDemand: "云端高清", soundCheck: "音色检查", openSoundCheck: "打开全部乐器音色检查", previewSound: "试听", retrySample: "重试", checkAll: "检查全部 17 件乐器", checkingAll: "正在逐件检查…", soundCheckTitle: "让每件乐器都发出正确的声音", soundCheckHelp: "逐件下载并解码代表音符。完整检查约需 30–45 MB；未加载或网络失败时仍会立即使用合成音色。", sampleCheckComplete: (ready: number) => `音色检查完成 · ${ready}/17 采样就绪`, cachedSample: "已缓存", fallbackActive: "回退可用", sampleError: "需要重试",
    arrangement: "编曲", arrangementTitle: "编曲时间线", randomSong: "随机整曲", randomSongHint: "一次生成多个连续段落，并让每段拥有不同的风格、乐器组合与演奏角色", randomSongTitle: "生成一首多段落作品", randomSongHelp: "选择 3–6 个段落和整体方向。混合风格会让每段切换风格；单一风格仍会在前奏、主歌、副歌与桥段之间改变配器。", arrangementStyle: "风格方向", sectionCount: "段落数量", replaceArrangement: "生成会替换当前音轨与片段；可使用撤销恢复。", generateArrangement: "生成整曲", randomSongCreated: (count: number) => `已生成 ${count} 个段落 · 不同配器与风格 · 可撤销`, selectTool: "选择工具", pencilTool: "铅笔工具", splitTool: "切割工具", grid: "网格", gridAccuracy: "网格精度", add: "添加", addInstrumentTrack: "添加乐器音轨", notes: "音符",
    pianoRoll: "钢琴卷帘", quantize: "量化 1/16", humanize: "人性化", randomize: "随机灵感", randomizeHint: "为当前选择生成新的音高和力度；空片段会自动生成旋律", randomClipName: "随机灵感", randomIdeaCreated: "随机灵感已生成 · 可撤销", duplicate: "重复", delete: "删除", rollHelp: "钢琴卷帘，点击空白处添加音符", stepLabel: (step: number) => `第 ${step} 格`, stepInput: "步进输入", stepInputHint: "开启后，按下方键盘、电脑 A–K 或 MIDI 键盘，音符会写入播放头并自动前进", liveRecordHint: "实时演奏请先待录音轨，再按 R 或录音键", learnMore: "查看完整说明",
    liveInput: "实时输入", note: "音符", velocity: "力度", octave: "八度", sustain: "延音", sampleReady: "采样就绪", playToLoad: "演奏以加载", computerKeys: "电脑键 A–K", keyboardLabel: "共享 61 键演奏键盘",
    channelStrip: "通道条", trackMixer: "音轨混音", selectedTrack: "已选音轨", trackName: "音轨名称", instrument: "乐器", inserts: "插入效果", compressor: "压缩器", eq: "三段均衡", on: "开", emptySlot: "空插槽", emptySlotReady: "空插槽已就绪", sends: "发送", reverb: "混响", delay: "延迟", pan: "声像", mute: "静音", solo: "独奏", arm: "待录", deleteTrack: "删除当前音轨",
    audioEngine: "音频引擎", polyphony: "复音数", autosave: "自动保存 · 本机", hardware: "硬件", midiDevice: "MIDI 设备", connected: "已连接", readyToConnect: "等待连接", searchingDevices: "正在搜索设备…", rescanMidi: "重新扫描 MIDI 输入", connectMidiKeyboard: "连接 MIDI 键盘", inputMode: "输入模式", allChannels: "全通道", latency: "延迟", interactive: "交互级", dataPrivacy: "数据隐私", localOnly: "仅限本机",
    deviceIdle: "尚未连接硬件；电脑键盘可直接演奏", deviceSearching: "正在请求 MIDI 设备权限…", deviceMissing: "未发现 MIDI 输入，请检查 USB 连接", deviceUnsupported: "当前浏览器不支持 Web MIDI，请使用桌面版 Chrome 或 Edge", deviceFailed: "连接失败；请允许 MIDI 权限后重试", devicePorts: (count: number) => `${count} 个输入端口在线 · 通道全开`,
    desktopBrowserRequired: "需要桌面版 Chrome 或 Edge", usbPreviewWarning: "内置预览可能无法访问 USB。请在受支持的浏览器打开正式站点并允许 MIDI 权限。", copySiteLink: "复制站点链接", siteLinkCopied: "站点链接已复制", controllerMap: "控制器映射", sustainPedal: "延音踏板", playSelectedTrack: "演奏当前音轨", computerSustain: "电脑键盘延音",
    addTrack: "添加音轨", chooseInstrument: "选择你的下一件乐器", sharedKeyboardHelp: "所有音轨共享下方键盘；每件乐器首次使用时加载公开高清采样，并始终保留零等待合成回退。", chineseSuite: "国风采样套组", chineseSuiteList: "古筝 · 二胡 · 琵琶 · 竹笛 · 扬琴 · 唢呐 · 笙 · 锣鼓", addEightTracks: "加入 8 条音轨", sampleBadge: "高清采样",
    settings: "设置", audioRecordingSettings: "音频与录音设置", lowLatencyHelp: "为浏览器内的低延迟演奏优化。", audioBuffer: "音频缓冲", bufferHelp: "延迟越低，CPU 占用越高", sampleRate: "采样率", sampleRateHelp: "当前音频上下文", recordingCountIn: "录音预备拍", recordingCountInHelp: "录音前播放一小节节拍", loopRecording: "循环录音", loopRecordingHelp: "持续覆盖 2 小节循环区域", done: "完成",
    keyCommands: "快捷键", handsOnMusic: "把双手留给音乐", keyboardMidiTogether: "电脑键盘与 MIDI 键盘可同时使用。", playPause: "播放 / 暂停", startStopRecording: "开始 / 停止录音", playCurrentSound: "演奏当前音色", undoEdit: "撤销编辑", deleteSelectedNote: "删除选中音符", saveLocally: "保存到本机",
    bounceShare: "导出与分享", takeYourMusic: "带走你的作品", trackCount: (count: number) => `${count} 条音轨`, noteCount: (count: number) => `${count} 个音符`, standardMidi: "标准 MIDI 文件", midiCompatibility: "兼容 Logic、Ableton、Cubase 与大多数硬件", projectBundle: "TupTup 工程包", projectBundleHelp: "保留音色、混音、速度和所有音轨数据", download: "下载", privacyPromise: "所有演奏与导出均在此设备完成，不会上传音乐数据。",
    sampleCredits: "采样鸣谢", sampleSuiteTitle: "公开高清采样音源", sampleCreditsHelp: "全部 17 件乐器均有采样映射。FluidR3 GM 音色按需流式加载并持久缓存在浏览器；无法联网时自动使用内置合成音色。", erhuPerformance: "真实二胡 Regular Vibrato A4 · 演奏 Yu Chun Chan", remainingSeven: "FluidR3 GM 音色库", soundfontMapping: "16 件乐器 · 88 音高完整 SoundFont · CC BY 3.0", berkleeSource: "Berklee 二胡采样来源", fluidSource: "FluidR3 SoundFont 来源", closePanel: "关闭面板",
    firstLoop: "完成你的第一首歌", beginnerHint: "四步开始，不需要先学会整套工作站。", chooseASound: "选择喜欢的音色", enableInput: "开启步进输入或待录", playFirstNote: "演奏第一颗音符", onboardingDone: "准备好了，开始创作", hideCoach: "收起新手引导", showCoach: "显示新手引导", startHere: "从这里开始",
    brandToast: "TupTup Studio · 浏览器 MIDI 工作站", sampleLoaded: (name: string) => `${name} 采样已就绪`, sampleFailed: (name: string) => `${name} 加载失败，已使用合成音色`, countInRecording: "预备拍开启 · 开始录音", recordingStarted: "录音已开始", recordingStopped: "录音已停止", midiConnected: "MIDI 键盘已连接", trackCreated: (name: string) => `${name} 音轨已创建`, suiteAdded: "国风采样套组已加入 · 8 条音轨", trackDeleted: "音轨已删除 · 可撤销", projectCreated: "新工程已创建", projectSaved: "工程已保存到此设备", midiExported: "MIDI 已导出", bundleExported: "工程包已导出", midiImported: (count: number) => `已导入 ${count} 条 MIDI 音轨`, midiImportFailed: "无法读取此 MIDI 文件",
  },
  en: {
    project: "Project", projectName: "Project name", projectActions: "Project actions", newProject: "New", importMidi: "Import MIDI", save: "Save", export: "Export", midiOnline: "MIDI Online", connectDevice: "Connect Device",
    language: "Language", switchLanguage: "切换到中文", guide: "Guide", openGuide: "Open the feature guide", transport: "Transport controls", openLibrary: "Open sound library", undo: "Undo", redo: "Redo", metronome: "Metronome", tempo: "Tempo", countIn: "Count-in", returnStart: "Return to start", pause: "Pause", play: "Play", stopRecording: "Stop recording", record: "Record", loop: "Loop", master: "Master", audioSettings: "Audio settings", openMixer: "Open mixer",
    browser: "Browser", libraryTitle: "Sound Library", tones: "Sounds", samples: "Samples", effects: "Effects", sampleLibraryManaged: "Manage the sample library in the project bundle", effectsInChannel: "Effects are available in the channel strip", studioCollection: "Studio", chineseCollection: "Chinese Samples", credits: "Credits", fullSuite: "Full Suite", tracks: "Tracks", ready: "Sample Ready", loading: "Loading Sample", synthFallback: "Synth Fallback", loadOnDemand: "Cloud HD", soundCheck: "Sound Check", openSoundCheck: "Open the all-instrument sound check", previewSound: "Preview", retrySample: "Retry", checkAll: "Check All 17 Instruments", checkingAll: "Checking every instrument…", soundCheckTitle: "Make sure every instrument sounds right", soundCheckHelp: "Downloads and decodes a representative note for every instrument. A full check uses about 30–45 MB; synthesis still responds instantly before samples load or when offline.", sampleCheckComplete: (ready: number) => `Sound check complete · ${ready}/17 samples ready`, cachedSample: "Cached", fallbackActive: "Fallback Ready", sampleError: "Retry Needed",
    arrangement: "Arrangement", arrangementTitle: "Arrangement Timeline", randomSong: "Random Song", randomSongHint: "Generate several consecutive sections with distinct styles, instrument combinations, and musical roles", randomSongTitle: "Generate a Multi-section Song", randomSongHelp: "Choose 3–6 sections and a direction. Mixed Styles changes style from section to section; a focused style still changes the instrumentation between intro, verse, chorus, and bridge.", arrangementStyle: "Style Direction", sectionCount: "Number of Sections", replaceArrangement: "Generation replaces the current tracks and clips; Undo restores them.", generateArrangement: "Generate Song", randomSongCreated: (count: number) => `${count} sections generated · varied styles and instrumentation · undo available`, selectTool: "Select tool", pencilTool: "Pencil tool", splitTool: "Split tool", grid: "Grid", gridAccuracy: "Grid resolution", add: "Add", addInstrumentTrack: "Add Instrument Track", notes: "Notes",
    pianoRoll: "Piano Roll", quantize: "Quantize 1/16", humanize: "Humanize", randomize: "Random Idea", randomizeHint: "Generate new pitches and velocities for the selection; empty clips receive a melody", randomClipName: "RANDOM IDEA", randomIdeaCreated: "Random idea generated · undo available", duplicate: "Duplicate", delete: "Delete", rollHelp: "Piano roll; click empty space to add a note", stepLabel: (step: number) => `step ${step}`, stepInput: "Step Input", stepInputHint: "Turn it on, then play the keyboard below, A–K, or a MIDI keyboard. Notes land at the playhead and advance automatically.", liveRecordHint: "For live performance, arm a track and press R or Record", learnMore: "View Full Guide",
    liveInput: "Live Input", note: "Note", velocity: "Velocity", octave: "Octave", sustain: "Sustain", sampleReady: "Sample Ready", playToLoad: "Play to Load", computerKeys: "Computer Keys A–K", keyboardLabel: "Shared 61-key performance keyboard",
    channelStrip: "Channel Strip", trackMixer: "Track Mixer", selectedTrack: "Selected Track", trackName: "Track name", instrument: "Instrument", inserts: "Inserts", compressor: "Compressor", eq: "3-Band EQ", on: "On", emptySlot: "Empty Slot", emptySlotReady: "Empty slot is ready", sends: "Sends", reverb: "Reverb", delay: "Delay", pan: "Pan", mute: "Mute", solo: "Solo", arm: "Arm", deleteTrack: "Delete Current Track",
    audioEngine: "Audio Engine", polyphony: "Polyphony", autosave: "Autosave · Local", hardware: "Hardware", midiDevice: "MIDI Device", connected: "Connected", readyToConnect: "Ready to Connect", searchingDevices: "Searching for devices…", rescanMidi: "Rescan MIDI Inputs", connectMidiKeyboard: "Connect MIDI Keyboard", inputMode: "Input Mode", allChannels: "Omni · All Channels", latency: "Latency", interactive: "Interactive", dataPrivacy: "Data Privacy", localOnly: "Local Only",
    deviceIdle: "No hardware connected; use the computer keyboard to play", deviceSearching: "Requesting MIDI device permission…", deviceMissing: "No MIDI input found; check the USB connection", deviceUnsupported: "Web MIDI is not supported here; use desktop Chrome or Edge", deviceFailed: "Connection failed; allow MIDI access and try again", devicePorts: (count: number) => `${count} input ${count === 1 ? "port" : "ports"} online · all channels`,
    desktopBrowserRequired: "Desktop Chrome or Edge Required", usbPreviewWarning: "The embedded preview may not access USB. Open the live site in a supported browser and allow MIDI permission.", copySiteLink: "Copy Site Link", siteLinkCopied: "Site link copied", controllerMap: "Controller Map", sustainPedal: "Sustain pedal", playSelectedTrack: "Play selected track", computerSustain: "Computer sustain",
    addTrack: "Add Track", chooseInstrument: "Choose Your Next Instrument", sharedKeyboardHelp: "Every track shares the keyboard below. Each instrument streams a public HD sample on first use and always keeps a zero-wait synth fallback.", chineseSuite: "Chinese Sample Suite", chineseSuiteList: "Guzheng · Erhu · Pipa · Dizi · Yangqin · Suona · Sheng · Percussion", addEightTracks: "Add 8 Tracks", sampleBadge: "HD Sample",
    settings: "Settings", audioRecordingSettings: "Audio & Recording Settings", lowLatencyHelp: "Optimized for low-latency performance in the browser.", audioBuffer: "Audio Buffer", bufferHelp: "Lower latency uses more CPU", sampleRate: "Sample Rate", sampleRateHelp: "Current audio context", recordingCountIn: "Recording Count-in", recordingCountInHelp: "Play one bar before recording", loopRecording: "Loop Recording", loopRecordingHelp: "Continuously overdub the two-bar loop", done: "Done",
    keyCommands: "Key Commands", handsOnMusic: "Keep Your Hands on the Music", keyboardMidiTogether: "Use the computer keyboard and a MIDI keyboard together.", playPause: "Play / Pause", startStopRecording: "Start / Stop Recording", playCurrentSound: "Play Current Sound", undoEdit: "Undo Edit", deleteSelectedNote: "Delete Selected Note", saveLocally: "Save Locally",
    bounceShare: "Bounce & Share", takeYourMusic: "Take Your Music With You", trackCount: (count: number) => `${count} ${count === 1 ? "track" : "tracks"}`, noteCount: (count: number) => `${count} ${count === 1 ? "note" : "notes"}`, standardMidi: "Standard MIDI File", midiCompatibility: "Works with Logic, Ableton, Cubase and most hardware", projectBundle: "TupTup Project Bundle", projectBundleHelp: "Preserves sounds, mix, tempo and every track", download: "Download", privacyPromise: "Performance and export stay on this device. No music data is uploaded.",
    sampleCredits: "Sample Credits", sampleSuiteTitle: "Open HD Sample Sources", sampleCreditsHelp: "All 17 instruments have sample mappings. FluidR3 GM sounds stream on demand and persist in the browser cache; built-in synthesis takes over when offline.", erhuPerformance: "Real Erhu Regular Vibrato A4 · performed by Yu Chun Chan", remainingSeven: "FluidR3 GM Library", soundfontMapping: "16 instruments · complete 88-note SoundFonts · CC BY 3.0", berkleeSource: "Berklee Erhu Sample Source", fluidSource: "FluidR3 SoundFont Source", closePanel: "Close panel",
    firstLoop: "Make Your First Song", beginnerHint: "Start in four steps—no need to learn the whole workstation first.", chooseASound: "Choose a sound you like", enableInput: "Enable Step Input or arm a track", playFirstNote: "Play your first note", onboardingDone: "You are ready—make some music", hideCoach: "Hide beginner guide", showCoach: "Show beginner guide", startHere: "Start Here",
    brandToast: "TupTup Studio · Browser MIDI Workstation", sampleLoaded: (name: string) => `${name} sample is ready`, sampleFailed: (name: string) => `${name} failed to load; using the synth fallback`, countInRecording: "Count-in enabled · recording started", recordingStarted: "Recording started", recordingStopped: "Recording stopped", midiConnected: "MIDI keyboard connected", trackCreated: (name: string) => `${name} track created`, suiteAdded: "Chinese sample suite added · 8 tracks", trackDeleted: "Track deleted · undo available", projectCreated: "New project created", projectSaved: "Project saved on this device", midiExported: "MIDI exported", bundleExported: "Project bundle exported", midiImported: (count: number) => `Imported ${count} MIDI ${count === 1 ? "track" : "tracks"}`, midiImportFailed: "This MIDI file could not be read",
  },
} as const;

type Track = MidiTrackV3;

type Voice = {
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  release: number;
};

type SampleAnchor = {
  note: number;
  buffer: AudioBuffer;
};

type TrackBus = {
  input: GainNode;
  volume: GainNode;
  pan: StereoPannerNode;
  send: GainNode;
};

const INSTRUMENTS: Instrument[] = [
  { id: "grand", name: "Studio Grand", family: "钢琴", nameZh: "录音室大钢琴", nameEn: "Studio Grand", familyZh: "钢琴", familyEn: "Piano", icon: "♩", color: "#9df564", wave: "triangle", overtone: "sine", attack: .008, release: .7, cutoff: 5200, program: 0, sample: SAMPLE_SOURCES.grand },
  { id: "electric", name: "Velvet Keys", family: "电钢", nameZh: "丝绒电钢", nameEn: "Velvet Keys", familyZh: "电钢", familyEn: "Electric Piano", icon: "⌁", color: "#63d7ff", wave: "sine", overtone: "triangle", attack: .012, release: .9, cutoff: 4200, program: 4, sample: SAMPLE_SOURCES.electric },
  { id: "pad", name: "Aurora Pad", family: "合成器", nameZh: "极光铺底", nameEn: "Aurora Pad", familyZh: "合成器", familyEn: "Synthesizer", icon: "≈", color: "#b69cff", wave: "sawtooth", overtone: "triangle", attack: .32, release: 1.5, cutoff: 1700, program: 89, sample: SAMPLE_SOURCES.pad },
  { id: "bass", name: "Deep Mono", family: "贝斯", nameZh: "深潜单声道", nameEn: "Deep Mono", familyZh: "贝斯", familyEn: "Bass", icon: "≋", color: "#ffbb55", wave: "square", overtone: "sawtooth", attack: .01, release: .35, cutoff: 1100, program: 38, sample: SAMPLE_SOURCES.bass },
  { id: "lead", name: "Neon Lead", family: "合成器", nameZh: "霓虹主音", nameEn: "Neon Lead", familyZh: "合成器", familyEn: "Synthesizer", icon: "⌁", color: "#ff6c8f", wave: "sawtooth", overtone: "square", attack: .018, release: .28, cutoff: 3600, program: 81, sample: SAMPLE_SOURCES.lead },
  { id: "organ", name: "Moon Organ", family: "风琴", nameZh: "月光风琴", nameEn: "Moon Organ", familyZh: "风琴", familyEn: "Organ", icon: "Ⅱ", color: "#f5e663", wave: "sine", overtone: "square", attack: .02, release: .5, cutoff: 4800, program: 16, sample: SAMPLE_SOURCES.organ },
  { id: "marimba", name: "Glass Marimba", family: "打击乐", nameZh: "玻璃马林巴", nameEn: "Glass Marimba", familyZh: "打击乐", familyEn: "Percussion", icon: "◇", color: "#57e0ba", wave: "sine", overtone: "sine", attack: .004, release: .42, cutoff: 7000, program: 12, sample: SAMPLE_SOURCES.marimba },
  { id: "strings", name: "Warm Ensemble", family: "弦乐", nameZh: "温暖弦乐群", nameEn: "Warm Ensemble", familyZh: "弦乐", familyEn: "Strings", icon: "〰", color: "#ef9dff", wave: "sawtooth", overtone: "triangle", attack: .16, release: 1.2, cutoff: 2300, program: 48, sample: SAMPLE_SOURCES.strings },
  { id: "drums", name: "Pulse Kit", family: "鼓组", nameZh: "脉冲鼓组", nameEn: "Pulse Kit", familyZh: "鼓组", familyEn: "Drum Kit", icon: "●", color: "#ff7a52", wave: "square", overtone: "sine", attack: .002, release: .2, cutoff: 6200, program: 0, sample: SAMPLE_SOURCES.drums },
  { id: "guzheng", name: "流光古筝", family: "国风 · 弹拨", nameZh: "流光古筝", nameEn: "Luminous Guzheng", familyZh: "国风 · 弹拨", familyEn: "Chinese · Plucked", icon: "筝", color: "#e7bd62", wave: "triangle", overtone: "sine", attack: .004, release: 1.1, cutoff: 6800, program: 107, collection: "chinese", sample: SAMPLE_SOURCES.guzheng },
  { id: "erhu", name: "烟雨二胡", family: "国风 · 拉弦", nameZh: "烟雨二胡", nameEn: "Mist Erhu", familyZh: "国风 · 拉弦", familyEn: "Chinese · Bowed", icon: "胡", color: "#dd7f6f", wave: "sawtooth", overtone: "triangle", attack: .035, release: .7, cutoff: 3900, program: 110, collection: "chinese", sample: SAMPLE_SOURCES.erhu },
  { id: "pipa", name: "飞花琵琶", family: "国风 · 弹拨", nameZh: "飞花琵琶", nameEn: "Blooming Pipa", familyZh: "国风 · 弹拨", familyEn: "Chinese · Plucked", icon: "琵", color: "#f29b63", wave: "triangle", overtone: "square", attack: .003, release: .65, cutoff: 6200, program: 106, collection: "chinese", sample: SAMPLE_SOURCES.pipa },
  { id: "dizi", name: "清风竹笛", family: "国风 · 吹管", nameZh: "清风竹笛", nameEn: "Bamboo Dizi", familyZh: "国风 · 吹管", familyEn: "Chinese · Wind", icon: "笛", color: "#64d9ad", wave: "sine", overtone: "triangle", attack: .035, release: .52, cutoff: 7200, program: 73, collection: "chinese", sample: SAMPLE_SOURCES.dizi },
  { id: "yangqin", name: "星河扬琴", family: "国风 · 击弦", nameZh: "星河扬琴", nameEn: "Starlight Yangqin", familyZh: "国风 · 击弦", familyEn: "Chinese · Hammered", icon: "扬", color: "#7fc5ef", wave: "triangle", overtone: "sine", attack: .003, release: .9, cutoff: 7500, program: 15, collection: "chinese", sample: SAMPLE_SOURCES.yangqin },
  { id: "suona", name: "赤焰唢呐", family: "国风 · 双簧", nameZh: "赤焰唢呐", nameEn: "Blazing Suona", familyZh: "国风 · 双簧", familyEn: "Chinese · Double Reed", icon: "呐", color: "#ff646c", wave: "sawtooth", overtone: "square", attack: .016, release: .35, cutoff: 5600, program: 111, collection: "chinese", sample: SAMPLE_SOURCES.suona },
  { id: "sheng", name: "云岫笙", family: "国风 · 簧管", nameZh: "云岫笙", nameEn: "Cloud Sheng", familyZh: "国风 · 簧管", familyEn: "Chinese · Free Reed", icon: "笙", color: "#b7a0ff", wave: "sine", overtone: "square", attack: .028, release: .65, cutoff: 5100, program: 20, collection: "chinese", sample: SAMPLE_SOURCES.sheng },
  { id: "chinesePercussion", name: "醒狮锣鼓", family: "国风 · 打击乐", nameZh: "醒狮锣鼓", nameEn: "Lion Dance Percussion", familyZh: "国风 · 打击乐", familyEn: "Chinese · Percussion", icon: "鼓", color: "#ffcc4f", wave: "square", overtone: "sine", attack: .002, release: .32, cutoff: 6600, program: 116, collection: "chinese", sample: SAMPLE_SOURCES.chinesePercussion },
];

const CORE_INSTRUMENTS = INSTRUMENTS.filter((instrument) => instrument.collection !== "chinese");
const CHINESE_INSTRUMENTS = INSTRUMENTS.filter((instrument) => instrument.collection === "chinese");

const RANDOM_STYLE_OPTIONS: ReadonlyArray<{ id: ArrangementStyleMode; nameZh: string; nameEn: string; detailZh: string; detailEn: string }> = [
  { id: "mixed", nameZh: "混合风格", nameEn: "Mixed Styles", detailZh: "每段轮换电子、Lo-Fi、电影、国风与放克", detailEn: "Rotate synthwave, lo-fi, cinematic, guofeng, and funk" },
  { id: "synthwave", nameZh: "霓虹电子", nameEn: "Synthwave", detailZh: "铺底、贝斯、鼓机、电钢与主音", detailEn: "Pads, bass, drums, electric keys, and lead" },
  { id: "lofi", nameZh: "卧室 Lo-Fi", nameEn: "Lo-Fi", detailZh: "松弛电钢、低音、鼓组与马林巴", detailEn: "Loose electric keys, bass, drums, and marimba" },
  { id: "cinematic", nameZh: "电影氛围", nameEn: "Cinematic", detailZh: "弦乐、长铺底、钢琴与稀疏打击", detailEn: "Strings, sustained pads, piano, and sparse percussion" },
  { id: "guofeng", nameZh: "流光国风", nameEn: "Guofeng", detailZh: "古筝、二胡、琵琶、竹笛与锣鼓", detailEn: "Guzheng, erhu, pipa, dizi, and percussion" },
  { id: "funk", nameZh: "弹性放克", nameEn: "Funk", detailZh: "风琴、贝斯、切分鼓组与合成主音", detailEn: "Organ, bass, syncopated drums, and synth lead" },
];

const SECTION_ROLES_BY_COUNT: Record<number, readonly SongSectionRole[]> = {
  3: ["intro", "chorus", "finale"],
  4: ["intro", "verse", "chorus", "finale"],
  5: ["intro", "verse", "chorus", "bridge", "finale"],
  6: ["intro", "verse", "prechorus", "chorus", "bridge", "finale"],
};

const SECTION_ROLE_NAMES: Record<SongSectionRole, { zh: string; en: string }> = {
  intro: { zh: "前奏", en: "Intro" }, verse: { zh: "主歌", en: "Verse" }, prechorus: { zh: "推进", en: "Pre-chorus" },
  chorus: { zh: "副歌", en: "Chorus" }, bridge: { zh: "桥段", en: "Bridge" }, finale: { zh: "终章", en: "Finale" },
};

function arrangementStyleName(style: ArrangementStyleId | "mixed", locale: Locale) {
  const option = RANDOM_STYLE_OPTIONS.find((item) => item.id === style) ?? RANDOM_STYLE_OPTIONS[0];
  return locale === "zh" ? option.nameZh : option.nameEn;
}

function sectionRoleName(role: SongSectionRole, locale: Locale) {
  return SECTION_ROLE_NAMES[role][locale];
}

const LEGACY_INITIAL_TRACKS: LegacyTrackV2[] = [
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

const INSTRUMENT_DEFAULTS: InstrumentDefaults = Object.fromEntries(INSTRUMENTS.map((instrument) => [instrument.id, {
  color: instrument.color,
  program: instrument.program,
  channel: instrument.id === "drums" || instrument.id === "chinesePercussion" ? 9 : undefined,
  name: instrument.name,
}])) as InstrumentDefaults;

const INITIAL_PROJECT = migrateProjectV2({ version: 2, name: "MIDNIGHT SKETCH", bpm: 112, masterVolume: 78, tracks: LEGACY_INITIAL_TRACKS }, INSTRUMENT_DEFAULTS);
INITIAL_PROJECT.id = "project-midnight-sketch";
INITIAL_PROJECT.updatedAt = 0;
INITIAL_PROJECT.tracks.forEach((track) => { track.clips[0].id = `clip-${track.id}`; });

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

function instrumentName(instrument: Instrument, locale: Locale) {
  return locale === "zh" ? instrument.nameZh : instrument.nameEn;
}

function instrumentFamily(instrument: Instrument, locale: Locale) {
  return locale === "zh" ? instrument.familyZh : instrument.familyEn;
}

function uid(prefix = "note") {
  return projectUid(prefix);
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export default function StudioWorkbench() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [project, setProject] = useState<ProjectDocumentV3>(() => cloneProject(INITIAL_PROJECT));
  const [projectHydrated, setProjectHydrated] = useState(false);
  const tracks = project.tracks;
  const bpm = project.bpm;
  const masterVolume = project.masterVolume;
  const looping = project.loop.enabled;
  const projectName = project.name;
  const [selectedTrackId, setSelectedTrackId] = useState(INITIAL_PROJECT.tracks[0].id);
  const [selectedClipId, setSelectedClipId] = useState(INITIAL_PROJECT.tracks[0].clips[0].id);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<ProjectDocumentV3[]>([]);
  const [future, setFuture] = useState<ProjectDocumentV3[]>([]);
  const [octave, setOctave] = useState(4);
  const [metronome, setMetronome] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countingIn, setCountingIn] = useState(false);
  const [currentTick, setCurrentTick] = useState(0);
  const [grid, setGrid] = useState<GridValue>("1/16");
  const [stepLength, setStepLength] = useState<GridValue>("1/16");
  const [zoom, setZoom] = useState(56);
  const [tool, setTool] = useState<"select" | "pencil" | "split">("select");
  const [quantizeStrength, setQuantizeStrength] = useState(100);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [mobileView, setMobileView] = useState<"arrangement" | "roll" | "performance" | "mixer">("arrangement");
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [rollViewport, setRollViewport] = useState({ left: 0, width: 800 });
  const [stepInput, setStepInput] = useState(false);
  const [countIn, setCountIn] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [deviceName, setDeviceName] = useState(TARGET_DEVICE);
  const [deviceMessageKind, setDeviceMessageKind] = useState<DeviceMessageKind>("idle");
  const [devicePortCount, setDevicePortCount] = useState(0);
  const [midiEventCount, setMidiEventCount] = useState(0);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<number | null>(null);
  const [lastVelocity, setLastVelocity] = useState(0);
  const [voiceCount, setVoiceCount] = useState(0);
  const [audioInfo, setAudioInfo] = useState<{ latencyMs: number; sampleRate: number } | null>(null);
  const [sampleStatus, setSampleStatus] = useState<Partial<Record<InstrumentId, SampleStatus>>>({});
  const [sampleProgress, setSampleProgress] = useState<Partial<Record<InstrumentId, number>>>({});
  const [soundCheckRunning, setSoundCheckRunning] = useState(false);
  const [soundCheckProgress, setSoundCheckProgress] = useState(0);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingSoundChosen, setOnboardingSoundChosen] = useState(false);
  const [sustain, setSustainState] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [randomSongStyle, setRandomSongStyle] = useState<ArrangementStyleMode>("mixed");
  const [randomSongSectionCount, setRandomSongSectionCount] = useState(5);
  const [deviceDrawer, setDeviceDrawer] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"library" | "mixer" | null>(null);
  const [toast, setToast] = useState("");

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const reverbRef = useRef<ConvolverNode | null>(null);
  const trackBusesRef = useRef(new Map<string, TrackBus>());
  const voicesRef = useRef(new Map<string, Voice>());
  const sampleAnchorsRef = useRef(new Map<InstrumentId, SampleAnchor[]>());
  const sampleCatalogRef = useRef(new Map<InstrumentId, SoundfontEntry[]>());
  const exactSampleBuffersRef = useRef(new Map<InstrumentId, Map<number, AudioBuffer>>());
  const sampleLruRef = useRef(new AudioBufferLru<AudioBuffer>(96 * 1024 * 1024));
  const exactSamplePromisesRef = useRef(new Map<string, Promise<AudioBuffer | null>>());
  const samplePromisesRef = useRef(new Map<InstrumentId, Promise<SampleAnchor[]>>());
  const liveVoiceKeysRef = useRef(new Map<number, string>());
  const heldNotesRef = useRef(new Set<number>());
  const sustainedNotesRef = useRef(new Set<number>());
  const sustainRef = useRef(false);
  const midiControllerRef = useRef<MidiInputController | null>(null);
  const projectRef = useRef(project);
  const metroRef = useRef(metronome);
  const currentTickRef = useRef(currentTick);
  const recordingRef = useRef(isRecording);
  const stepInputRef = useRef(stepInput);
  const stepChordStartRef = useRef<number | null>(null);
  const recordStartsRef = useRef(new Map<number, { tick: number; trackId: string; clipId: string; velocity: number; contextTime: number }>());
  const toastTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const schedulerTimerRef = useRef<number | null>(null);
  const scheduleTickRef = useRef(0);
  const scheduleTimeRef = useRef(0);
  const displayTimeRef = useRef(0);
  const countInTimerRef = useRef<number | null>(null);
  const projectGestureRef = useRef<ProjectDocumentV3 | null>(null);
  const arrangementScrollRef = useRef<HTMLDivElement | null>(null);
  const rollGridRef = useRef<HTMLDivElement | null>(null);
  const rollBodyRef = useRef<HTMLDivElement | null>(null);
  const triggerNoteRef = useRef<(note: number, velocity?: number, trackId?: string, source?: "live" | "sequence" | "preview", durationSeconds?: number, presetOverride?: InstrumentId, scheduledWhen?: number) => string>(() => "");
  const releaseLiveNoteRef = useRef<(note: number) => void>(() => {});
  const setSustainRef = useRef<(enabled: boolean) => void>(() => {});

  const t = UI_TEXT[locale];
  const allKeyboardNotes = useMemo(() => Array.from({ length: KEYBOARD_HIGH - KEYBOARD_LOW + 1 }, (_, i) => KEYBOARD_LOW + i), []);
  const whiteNotes = useMemo(() => allKeyboardNotes.filter((note) => !isBlack(note)), [allKeyboardNotes]);
  const blackNotes = useMemo(() => allKeyboardNotes.filter(isBlack), [allKeyboardNotes]);
  const editorNotes = useMemo(() => Array.from({ length: EDITOR_HIGH - EDITOR_LOW + 1 }, (_, i) => EDITOR_HIGH - i), []);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0];
  const selectedClip = selectedTrack?.clips.find((clip) => clip.id === selectedClipId) ?? selectedTrack?.clips[0] ?? null;
  const selectedInstrument = instrumentById(selectedTrack?.instrument ?? "grand");
  const selectedNote = selectedClip?.notes.find((note) => note.id === selectedNoteId) ?? null;
  const onboardingInputReady = Boolean(stepInput || selectedTrack?.arm);
  const onboardingPlayed = lastNote !== null;
  const onboardingClipReady = Boolean(selectedClip);
  const onboardingComplete = onboardingSoundChosen && onboardingClipReady && onboardingInputReady && onboardingPlayed;
  const position = tickToBarBeat(currentTick, project.timeSignature);
  const measure = position.bar;
  const beat = position.beat;
  const subdivision = position.subdivision;
  const projectEndTick = songEndTick(project);
  const timelineWidth = project.lengthBars * zoom;
  const rollCanvasWidth = Math.max(672, (selectedClip?.contentLengthTicks ?? barTicks(project.timeSignature)) / barTicks(project.timeSignature) * 96);
  const rollVisibleRange = {
    from: Math.max(0, rollViewport.left / rollCanvasWidth * (selectedClip?.contentLengthTicks ?? 0) - barTicks(project.timeSignature)),
    to: Math.min(selectedClip?.contentLengthTicks ?? 0, (rollViewport.left + rollViewport.width) / rollCanvasWidth * (selectedClip?.contentLengthTicks ?? 0) + barTicks(project.timeSignature)),
  };
  const deviceMessage = deviceMessageKind === "searching" ? t.deviceSearching
    : deviceMessageKind === "connected" ? t.devicePorts(devicePortCount)
      : deviceMessageKind === "missing" ? t.deviceMissing
        : deviceMessageKind === "unsupported" ? t.deviceUnsupported
          : deviceMessageKind === "failed" ? t.deviceFailed
            : t.deviceIdle;
  const statusFor = (instrumentId: InstrumentId): SampleStatus => sampleStatus[instrumentId] ?? "idle";
  const statusLabel = (instrumentId: InstrumentId) => {
    const status = statusFor(instrumentId);
    return status === "ready" ? t.cachedSample : status === "loading" ? `${t.loading}${sampleProgress[instrumentId] !== undefined ? ` · ${sampleProgress[instrumentId]}%` : ""}` : status === "fallback" ? t.fallbackActive : status === "error" ? t.sampleError : t.loadOnDemand;
  };
  const statusIcon = (instrumentId: InstrumentId) => {
    const status = statusFor(instrumentId);
    return status === "ready" ? "✓" : status === "loading" ? "◌" : status === "fallback" ? "≈" : status === "error" ? "!" : "↓";
  };

  const pruneEvictedSamples = useCallback(() => {
    for (const key of sampleLruRef.current.takeEvictedKeys()) {
      const [instrumentId, noteText] = key.split(":") as [InstrumentId, string];
      const note = Number(noteText);
      exactSampleBuffersRef.current.get(instrumentId)?.delete(note);
      const anchors = sampleAnchorsRef.current.get(instrumentId);
      if (anchors) sampleAnchorsRef.current.set(instrumentId, anchors.filter((anchor) => anchor.note !== note));
    }
  }, []);

  const changeLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en";
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }, []);

  const commitProject = useCallback((updater: (current: ProjectDocumentV3) => ProjectDocumentV3) => {
    setProject((current) => {
      const next = updater(cloneProject(current));
      if (next === current) return current;
      next.lengthBars = requiredSongBars(next, Math.max(projectContentEnd(next), currentTickRef.current));
      next.updatedAt = Date.now();
      setHistory((items) => [...items.slice(-49), cloneProject(current)]);
      setFuture([]);
      return next;
    });
  }, []);

  const commitTracks = useCallback((updater: (current: Track[]) => Track[]) => {
    commitProject((current) => ({ ...current, tracks: updater(current.tracks) }));
  }, [commitProject]);

  const beginProjectGesture = () => {
    if (!projectGestureRef.current) projectGestureRef.current = cloneProject(projectRef.current);
  };

  const endProjectGesture = () => {
    const base = projectGestureRef.current;
    if (!base) return;
    projectGestureRef.current = null;
    setHistory((items) => [...items.slice(-49), base]);
    setFuture([]);
  };

  const insertNoteAtSongTick = useCallback((trackId: string, preferredClipId: string | null, songTick: number, durationTicks: number, pitch: number, velocity: number, id = uid("note")) => {
    let resolvedClipId = preferredClipId;
    commitProject((current) => {
      const ticksPerBar = barTicks(current.timeSignature);
      const tracksNext = current.tracks.map((track) => {
        if (track.id !== trackId) return track;
        let clip = track.clips.find((item) => item.id === preferredClipId && songTick >= item.startTick && songTick < item.startTick + item.displayLengthTicks);
        let clips = track.clips;
        if (!clip) {
          const clipStart = Math.floor(songTick / ticksPerBar) * ticksPerBar;
          clip = createClip(clipStart, ticksPerBar, `${track.name} ${track.clips.length + 1}`);
          clips = [...clips, clip];
        }
        resolvedClipId = clip.id;
        const rawLocalTick = Math.max(0, songTick - clip.startTick);
        const localTick = clip.loopEnabled ? rawLocalTick % Math.max(1, clip.contentLengthTicks) : rawLocalTick;
        const requiredLength = clip.loopEnabled ? clip.contentLengthTicks : Math.max(clip.contentLengthTicks, localTick + durationTicks);
        const note: MidiNoteV3 = { id, pitch, tick: localTick, durationTicks: Math.max(1, durationTicks), velocity };
        return {
          ...track,
          clips: clips.map((item) => item.id === clip?.id ? {
            ...item,
            contentLengthTicks: requiredLength,
            displayLengthTicks: item.loopEnabled ? item.displayLengthTicks : Math.max(item.displayLengthTicks, requiredLength),
            notes: [...item.notes, note],
          } : item),
        };
      });
      return { ...current, tracks: tracksNext };
    });
    if (resolvedClipId) setSelectedClipId(resolvedClipId);
    setSelectedNoteId(id);
    setSelectedNoteIds(new Set([id]));
    return id;
  }, [commitProject]);

  const undo = useCallback(() => {
    setHistory((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setSelectedTrackId(previous.tracks[0]?.id ?? "");
      setSelectedClipId(previous.tracks[0]?.clips[0]?.id ?? "");
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setProject((current) => {
        setFuture((redoItems) => [cloneProject(current), ...redoItems].slice(0, 50));
        return cloneProject(previous);
      });
      return items.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setSelectedTrackId(next.tracks[0]?.id ?? "");
      setSelectedClipId(next.tracks[0]?.clips[0]?.id ?? "");
      setSelectedNoteId(null);
      setSelectedNoteIds(new Set());
      setProject((current) => {
        setHistory((undoItems) => [...undoItems.slice(-49), cloneProject(current)]);
        return cloneProject(next);
      });
      return items.slice(1);
    });
  }, []);

  const destroyAudioGraph = useCallback((updateUi = true) => {
    const context = audioContextRef.current;
    audioContextRef.current = null;

    voicesRef.current.forEach((voice) => {
      voice.sources.forEach((source) => {
        source.onended = null;
        try { source.stop(); } catch { /* already stopped */ }
        source.disconnect();
      });
      voice.gain.disconnect();
    });
    voicesRef.current.clear();
    liveVoiceKeysRef.current.clear();
    heldNotesRef.current.clear();
    sustainedNotesRef.current.clear();
    sustainRef.current = false;

    trackBusesRef.current.forEach((bus) => {
      bus.input.disconnect();
      bus.volume.disconnect();
      bus.pan.disconnect();
      bus.send.disconnect();
    });
    trackBusesRef.current.clear();
    masterGainRef.current?.disconnect();
    limiterRef.current?.disconnect();
    reverbRef.current?.disconnect();
    masterGainRef.current = null;
    limiterRef.current = null;
    reverbRef.current = null;

    if (updateUi) {
      setVoiceCount(0);
      setActiveNotes(new Set());
      setSustainState(false);
      setAudioInfo(null);
    }
    if (context && context.state !== "closed") return context.close();
    return Promise.resolve();
  }, []);

  const ensureAudio = useCallback(() => {
    let context = audioContextRef.current;
    if (context?.state === "closed") {
      void destroyAudioGraph();
      context = null;
    }
    if (!context) {
      context = new AudioContext({ latencyHint: "interactive" });
      const master = context.createGain();
      master.gain.value = masterVolume / 100 * .7;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 16;
      limiter.attack.value = .003;
      limiter.release.value = .12;
      const reverb = context.createConvolver();
      const impulse = context.createBuffer(2, context.sampleRate * 1.8, context.sampleRate);
      for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
        const data = impulse.getChannelData(channel);
        for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length) ** 2.4;
      }
      reverb.buffer = impulse;
      const returnGain = context.createGain();
      returnGain.gain.value = .32;
      reverb.connect(returnGain).connect(master);
      master.connect(limiter).connect(context.destination);
      audioContextRef.current = context;
      masterGainRef.current = master;
      limiterRef.current = limiter;
      reverbRef.current = reverb;
      trackBusesRef.current.clear();
      setAudioInfo({ latencyMs: Math.round((context.baseLatency || 0) * 10_000) / 10, sampleRate: context.sampleRate });
    }
    if (context.state === "suspended") void context.resume();
    return context;
  }, [destroyAudioGraph, masterVolume]);

  const getTrackBus = useCallback((track: Track) => {
    const context = ensureAudio();
    let bus = trackBusesRef.current.get(track.id);
    if (!bus) {
      const input = context.createGain();
      const volume = context.createGain();
      const pan = context.createStereoPanner();
      const send = context.createGain();
      input.connect(volume).connect(pan).connect(masterGainRef.current!);
      if (reverbRef.current) input.connect(send).connect(reverbRef.current);
      bus = { input, volume, pan, send };
      trackBusesRef.current.set(track.id, bus);
    }
    const now = context.currentTime;
    bus.volume.gain.setTargetAtTime(track.volume / 100, now, .015);
    bus.pan.pan.setTargetAtTime(track.pan / 100, now, .015);
    bus.send.gain.setTargetAtTime(track.reverb / 100 * .42, now, .015);
    return bus;
  }, [ensureAudio]);

  const loadSampleInstrument = useCallback((preset: Instrument, announce = true, force = false) => {
    const sample = preset.sample;
    const cached = sampleAnchorsRef.current.get(preset.id);
    if (cached && !force) return Promise.resolve(cached);
    const pending = samplePromisesRef.current.get(preset.id);
    if (pending) return pending;

    if (force) {
      sampleAnchorsRef.current.delete(preset.id);
      sampleCatalogRef.current.delete(preset.id);
      exactSampleBuffersRef.current.delete(preset.id);
      sampleLruRef.current.deletePrefix(`${preset.id}:`);
      pruneEvictedSamples();
    }

    setSampleStatus((status) => ({ ...status, [preset.id]: "loading" }));
    setSampleProgress((progress) => ({ ...progress, [preset.id]: 0 }));
    const promise = (async () => {
      try {
        const context = ensureAudio();
        let anchors: SampleAnchor[];
        if (sample.kind === "audio") {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 15_000);
          try {
            const response = await fetch(sample.asset, { signal: controller.signal });
            if (!response.ok) throw new Error("Sample request failed");
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            setSampleProgress((progress) => ({ ...progress, [preset.id]: 100 }));
            anchors = [{ note: sample.rootNote, buffer }];
          } finally {
            window.clearTimeout(timeout);
          }
        } else {
          const javascript = await fetchSoundfontText(sample, { force, timeoutMs: 15_000, onProgress: (value) => {
            if (value !== null) setSampleProgress((progress) => ({ ...progress, [preset.id]: value }));
          } });
          const catalog = parseMidiJsSoundfont(javascript);
          if (catalog.length < sample.expectedNotes) throw new Error(`Incomplete SoundFont: ${catalog.length}/${sample.expectedNotes}`);
          sampleCatalogRef.current.set(preset.id, catalog);
          anchors = await decodeSoundfontAnchors(catalog, (entry) => context.decodeAudioData(dataUrlToArrayBuffer(entry.dataUrl)));
          exactSampleBuffersRef.current.set(preset.id, new Map(anchors.map((anchor) => [anchor.note, anchor.buffer])));
        }
        if (!anchors.length) throw new Error("No decodable sample anchors");
        sampleAnchorsRef.current.set(preset.id, anchors);
        anchors.forEach((anchor) => sampleLruRef.current.set(`${preset.id}:${anchor.note}`, anchor.buffer));
        pruneEvictedSamples();
        setSampleStatus((status) => ({ ...status, [preset.id]: "ready" }));
        if (announce) notify(t.sampleLoaded(instrumentName(preset, locale)));
        return anchors;
      } catch {
        setSampleStatus((status) => ({ ...status, [preset.id]: force ? "error" : "fallback" }));
        if (announce) notify(t.sampleFailed(instrumentName(preset, locale)));
        return [];
      } finally {
        samplePromisesRef.current.delete(preset.id);
      }
    })();
    samplePromisesRef.current.set(preset.id, promise);
    return promise;
  }, [ensureAudio, locale, notify, pruneEvictedSamples, t]);

  const decodeExactSoundfontNote = useCallback((preset: Instrument, note: number) => {
    if (preset.sample.kind !== "soundfont") return Promise.resolve(null);
    const catalog = sampleCatalogRef.current.get(preset.id);
    if (!catalog?.length) return Promise.resolve(null);
    const entry = catalog.find((item) => item.note === note) ?? nearestSoundfontEntry(catalog, note);
    if (!entry) return Promise.resolve(null);
    const decoded = sampleLruRef.current.get(`${preset.id}:${entry.note}`) ?? exactSampleBuffersRef.current.get(preset.id)?.get(entry.note);
    if (decoded) return Promise.resolve(decoded);
    const promiseKey = `${preset.id}:${entry.note}`;
    const pending = exactSamplePromisesRef.current.get(promiseKey);
    if (pending) return pending;
    const promise = ensureAudio().decodeAudioData(dataUrlToArrayBuffer(entry.dataUrl)).then((buffer) => {
      const buffers = exactSampleBuffersRef.current.get(preset.id) ?? new Map<number, AudioBuffer>();
      buffers.set(entry.note, buffer);
      exactSampleBuffersRef.current.set(preset.id, buffers);
      sampleLruRef.current.set(`${preset.id}:${entry.note}`, buffer);
      pruneEvictedSamples();
      return buffer;
    }).catch(() => null).finally(() => exactSamplePromisesRef.current.delete(promiseKey));
    exactSamplePromisesRef.current.set(promiseKey, promise);
    return promise;
  }, [ensureAudio, pruneEvictedSamples]);

  const stopVoice = useCallback((key: string, fast = false) => {
    const voice = voicesRef.current.get(key);
    const context = audioContextRef.current;
    if (!voice || !context) return;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(.0001, now, fast ? .012 : Math.max(.03, voice.release / 4));
    voice.sources.forEach((source) => {
      try { source.stop(now + (fast ? .08 : voice.release)); } catch { /* already stopped */ }
    });
    voicesRef.current.delete(key);
    setVoiceCount(voicesRef.current.size);
  }, []);

  const triggerNote = useCallback((note: number, velocity = 96, trackId = selectedTrackId, source: "live" | "sequence" | "preview" = "live", durationSeconds?: number, presetOverride?: InstrumentId, scheduledWhen?: number) => {
    const liveProject = projectRef.current;
    const track = liveProject.tracks.find((item) => item.id === trackId) ?? liveProject.tracks[0];
    if (!track || (source !== "preview" && (track.mute || (liveProject.tracks.some((item) => item.solo) && !track.solo)))) return "";
    const context = ensureAudio();
    const master = masterGainRef.current;
    if (!master) return "";
    const bus = getTrackBus(track);
    if (source === "live") {
      const prior = liveVoiceKeysRef.current.get(note);
      if (prior) {
        stopVoice(prior, true);
        heldNotesRef.current.delete(note);
      }
    }
    const preset = instrumentById(presetOverride ?? track.instrument);
    if (source !== "sequence") {
      sampleLruRef.current.retain([`${preset.id}:`]);
      pruneEvictedSamples();
    }
    const key = `${source}-${trackId}-${note}-${context.currentTime}-${Math.random()}`;
    const now = Math.max(context.currentTime, scheduledWhen ?? context.currentTime);
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const strength = Math.max(.06, velocity / 127);
    const sampleAnchors = sampleAnchorsRef.current.get(preset.id);
    const captureLivePerformance = () => {
      const joinsHeldChord = heldNotesRef.current.size > 0;
      liveVoiceKeysRef.current.set(note, key);
      heldNotesRef.current.add(note);
      setActiveNotes((notes) => new Set(notes).add(note));
      setLastNote(note);
      setLastVelocity(velocity);
      if (recordingRef.current) {
        let clip = track.clips.find((item) => item.id === selectedClipId && currentTickRef.current >= item.startTick && currentTickRef.current < item.startTick + item.displayLengthTicks);
        if (!clip) clip = track.clips.find((item) => currentTickRef.current >= item.startTick && currentTickRef.current < item.startTick + item.displayLengthTicks);
        recordStartsRef.current.set(note, { tick: currentTickRef.current, trackId, clipId: clip?.id ?? "", velocity, contextTime: context.currentTime });
        return;
      }
      if (!stepInputRef.current) return;
      const start = joinsHeldChord && stepChordStartRef.current !== null ? stepChordStartRef.current : snapTick(currentTickRef.current, stepLength);
      insertNoteAtSongTick(trackId, selectedClipId, start, GRID_VALUES[stepLength], note, velocity, uid("step"));
      if (joinsHeldChord) return;
      stepChordStartRef.current = start;
      const nextTick = Math.min(songEndTick(projectRef.current), start + GRID_VALUES[stepLength]);
      currentTickRef.current = nextTick;
      setCurrentTick(nextTick);
    };

    if (sampleAnchors?.length) {
      const exactBuffer = exactSampleBuffersRef.current.get(preset.id)?.get(note);
      const anchor = exactBuffer ? { note, buffer: exactBuffer } : sampleAnchors.reduce((best, item) => Math.abs(item.note - note) < Math.abs(best.note - note) ? item : best, sampleAnchors[0]);
      if (!exactBuffer) void decodeExactSoundfontNote(preset, note);
      const sampleSource = context.createBufferSource();
      sampleSource.buffer = anchor.buffer;
      sampleSource.playbackRate.value = 2 ** ((note - anchor.note) / 12);
      panner.pan.value = 0;
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.38 * strength, now + Math.max(.003, preset.attack));
      sampleSource.connect(gain).connect(panner).connect(bus.input);
      sampleSource.start(now);
      sampleSource.onended = () => {
        if (voicesRef.current.get(key)?.sources.includes(sampleSource)) {
          voicesRef.current.delete(key);
          setVoiceCount(voicesRef.current.size);
        }
      };
      voicesRef.current.set(key, { sources: [sampleSource], gain, release: preset.release });
      setVoiceCount(voicesRef.current.size);
      if (source === "live") {
        captureLivePerformance();
      } else if (durationSeconds) {
        gain.gain.setTargetAtTime(.0001, now + durationSeconds, Math.max(.02, preset.release / 5));
        try { sampleSource.stop(now + durationSeconds + preset.release); } catch { /* already stopped */ }
      }
      return key;
    }

    if (sampleStatus[preset.id] !== "loading" && sampleStatus[preset.id] !== "fallback") void loadSampleInstrument(preset, false);
    const filter = context.createBiquadFilter();
    const oscillators = [context.createOscillator(), context.createOscillator()];
    const isPercussion = preset.id === "drums" || preset.id === "chinesePercussion";
    const baseFrequency = isPercussion ? (note === 36 ? 74 : note === 38 ? 185 : 430) : noteFrequency(note);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(preset.cutoff * (.62 + strength * .52), now);
    filter.Q.value = preset.id === "bass" ? 4.2 : .8;
    panner.pan.value = 0;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime((preset.id === "pad" ? .06 : .11) * strength, now + preset.attack);
    gain.gain.exponentialRampToValueAtTime((isPercussion ? .0002 : .045) * strength, now + (isPercussion ? .16 : Math.max(.28, preset.attack + .4)));
    oscillators[0].type = preset.wave;
    oscillators[0].frequency.setValueAtTime(baseFrequency, now);
    oscillators[1].type = preset.overtone;
    oscillators[1].frequency.setValueAtTime(baseFrequency * (preset.id === "organ" ? 2 : isPercussion ? 1.65 : 2), now);
    oscillators[1].detune.value = preset.id === "pad" || preset.id === "strings" ? 9 : 2;
    const overtoneGain = context.createGain();
    overtoneGain.gain.value = preset.id === "organ" ? .42 : preset.id === "marimba" ? .34 : .17;
    oscillators[0].connect(filter);
    oscillators[1].connect(overtoneGain).connect(filter);
    filter.connect(gain).connect(panner).connect(bus.input);
    oscillators.forEach((oscillator) => oscillator.start(now));
    voicesRef.current.set(key, { sources: oscillators, gain, release: preset.release });
    setVoiceCount(voicesRef.current.size);
    if (source === "live") {
      captureLivePerformance();
    } else if (durationSeconds) {
      gain.gain.setTargetAtTime(.0001, now + durationSeconds, Math.max(.02, preset.release / 5));
      oscillators.forEach((oscillator) => {
        try { oscillator.stop(now + durationSeconds + preset.release); } catch { /* already stopped */ }
      });
    }
    return key;
  }, [decodeExactSoundfontNote, ensureAudio, getTrackBus, insertNoteAtSongTick, loadSampleInstrument, pruneEvictedSamples, sampleStatus, selectedClipId, selectedTrackId, stepLength, stopVoice]);

  const finalizeRecordedNote = useCallback((note: number) => {
    const recordStart = recordStartsRef.current.get(note);
    if (!recordStart) return;
    const activeProject = projectRef.current;
    const elapsedTicks = audioContextRef.current ? secondsToTicks(Math.max(0, audioContextRef.current.currentTime - recordStart.contextTime), activeProject.bpm, activeProject.ppq) : 0;
    insertNoteAtSongTick(recordStart.trackId, recordStart.clipId || null, recordStart.tick, Math.max(GRID_VALUES[grid], Math.round(elapsedTicks)), note, recordStart.velocity);
    recordStartsRef.current.delete(note);
  }, [grid, insertNoteAtSongTick]);

  const releaseLiveNote = useCallback((note: number) => {
    heldNotesRef.current.delete(note);
    if (heldNotesRef.current.size === 0) stepChordStartRef.current = null;
    const key = liveVoiceKeysRef.current.get(note);
    if (!key) return;
    if (sustainRef.current) {
      sustainedNotesRef.current.add(note);
    } else {
      stopVoice(key);
      liveVoiceKeysRef.current.delete(note);
      setActiveNotes((notes) => { const next = new Set(notes); next.delete(note); return next; });
      finalizeRecordedNote(note);
    }
  }, [finalizeRecordedNote, stopVoice]);

  const setSustain = useCallback((enabled: boolean) => {
    sustainRef.current = enabled;
    setSustainState(enabled);
    if (!enabled) {
      sustainedNotesRef.current.forEach((note) => {
        if (heldNotesRef.current.has(note)) return;
        const key = liveVoiceKeysRef.current.get(note);
        if (key) stopVoice(key);
        liveVoiceKeysRef.current.delete(note);
        finalizeRecordedNote(note);
      });
      sustainedNotesRef.current.clear();
      setActiveNotes(new Set(heldNotesRef.current));
    }
  }, [finalizeRecordedNote, stopVoice]);

  const clickMetronome = useCallback((accent: boolean, scheduledWhen?: number) => {
    const context = ensureAudio();
    const master = masterGainRef.current;
    if (!master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    const when = Math.max(context.currentTime, scheduledWhen ?? context.currentTime);
    oscillator.frequency.value = accent ? 1320 : 920;
    gain.gain.setValueAtTime(.045, when);
    gain.gain.exponentialRampToValueAtTime(.0001, when + .045);
    oscillator.connect(gain).connect(master);
    oscillator.start(when);
    oscillator.stop(when + .05);
  }, [ensureAudio]);

  const stopTransport = useCallback(() => {
    setIsPlaying(false);
    setIsRecording(false);
    recordingRef.current = false;
    recordStartsRef.current.forEach((start, note) => {
      const activeProject = projectRef.current;
      const elapsedTicks = audioContextRef.current ? secondsToTicks(Math.max(0, audioContextRef.current.currentTime - start.contextTime), activeProject.bpm, activeProject.ppq) : 1;
      insertNoteAtSongTick(start.trackId, start.clipId || null, start.tick, Math.max(1, Math.round(elapsedTicks)), note, start.velocity);
    });
    recordStartsRef.current.clear();
    if (countInTimerRef.current) window.clearTimeout(countInTimerRef.current);
    setCountingIn(false);
    voicesRef.current.forEach((_, key) => { if (key.startsWith("sequence-")) stopVoice(key, true); });
  }, [insertNoteAtSongTick, stopVoice]);

  const restartAudioEngine = useCallback(async () => {
    stopTransport();
    await destroyAudioGraph();
    sampleLruRef.current.clear();
    sampleAnchorsRef.current.clear();
    exactSampleBuffersRef.current.clear();
    setSampleStatus({});
    notify(locale === "zh" ? "音频引擎已重启" : "Audio engine restarted");
  }, [destroyAudioGraph, locale, notify, stopTransport]);

  const togglePlay = useCallback(() => {
    ensureAudio();
    setIsPlaying((playing) => !playing);
  }, [ensureAudio]);

  const toggleRecord = useCallback(() => {
    const context = ensureAudio();
    if (isRecording || countingIn) {
      setIsRecording(false);
      recordingRef.current = false;
      setCountingIn(false);
      if (countInTimerRef.current) window.clearTimeout(countInTimerRef.current);
      notify(t.recordingStopped);
      return;
    }
    const begin = () => {
      setCountingIn(false);
      setIsRecording(true);
      recordingRef.current = true;
      setIsPlaying(true);
      notify(t.recordingStarted);
    };
    if (countIn && !isPlaying) {
      const signature = projectRef.current.timeSignature;
      const beatSeconds = 60 / projectRef.current.bpm * 4 / signature.denominator;
      setCountingIn(true);
      for (let index = 0; index < signature.numerator; index += 1) clickMetronome(index === 0, context.currentTime + .05 + index * beatSeconds);
      countInTimerRef.current = window.setTimeout(begin, (signature.numerator * beatSeconds + .05) * 1000);
      notify(t.countInRecording);
    } else begin();
  }, [clickMetronome, countIn, countingIn, ensureAudio, isPlaying, isRecording, notify, t]);

  const connectMidi = useCallback(async () => {
    if (!("requestMIDIAccess" in navigator)) {
      setConnection("error");
      setDeviceMessageKind("unsupported");
      return;
    }
    setConnection("searching");
    setDeviceMessageKind("searching");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      let controller = midiControllerRef.current;
      if (!controller) {
        controller = new MidiInputController({
          onMessage: (message) => {
            setMidiEventCount((count) => count + 1);
            if (message.type === "note-on") triggerNoteRef.current(message.note, message.velocity);
            if (message.type === "note-off") releaseLiveNoteRef.current(message.note);
            if (message.type === "sustain") setSustainRef.current(message.enabled);
          },
          onInputsChanged: (inputs) => {
            setDevicePortCount(inputs.length);
            if (!inputs.length) {
              setConnection("missing");
              setDeviceMessageKind("missing");
              return;
            }
            const primary = inputs.find((input) => input.name?.toLowerCase().includes("tuptup") || input.name?.toLowerCase().includes("sam5704")) ?? inputs[0];
            setDeviceName(primary.name || TARGET_DEVICE);
            setConnection("connected");
            setDeviceMessageKind("connected");
          },
          onError: () => {
            setConnection("error");
            setDeviceMessageKind("failed");
          },
        });
        midiControllerRef.current = controller;
      }
      const inputs = await controller.connect(access);
      if (!inputs.length) return;
      ensureAudio();
      notify(t.midiConnected);
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "";
      setConnection(errorName === "NotAllowedError" || errorName === "SecurityError" ? "blocked" : "error");
      setDeviceMessageKind("failed");
    }
  }, [ensureAudio, notify, t]);

  const addTrack = useCallback((instrumentId: InstrumentId) => {
    const instrument = instrumentById(instrumentId);
    const localizedName = instrumentName(instrument, locale);
    const track: Track = { id: uid("track"), name: locale === "en" ? localizedName.toUpperCase() : localizedName, instrument: instrument.id, color: instrument.color, program: instrument.program, channel: instrument.id === "drums" || instrument.id === "chinesePercussion" ? 9 : tracks.length % 16, volume: 76, pan: 0, reverb: 18, mute: false, solo: false, arm: true, clips: [] };
    commitTracks((current) => [...current.map((item) => ({ ...item, arm: false })), track]);
    setSelectedTrackId(track.id);
    setSelectedClipId("");
    setSelectedNoteId(null);
    setModal(null);
    setOnboardingSoundChosen(true);
    void loadSampleInstrument(instrument);
    notify(t.trackCreated(localizedName));
  }, [commitTracks, loadSampleInstrument, locale, notify, t, tracks.length]);

  const addChineseSuite = useCallback(() => {
    const suite = CHINESE_INSTRUMENTS.map((instrument, index): Track => ({
      id: uid("track"), name: locale === "en" ? instrument.nameEn.toUpperCase() : instrument.nameZh, instrument: instrument.id, color: instrument.color,
      program: instrument.program, channel: instrument.id === "chinesePercussion" ? 9 : (tracks.length + index) % 16,
      volume: instrument.id === "suona" ? 62 : 76, pan: index % 2 === 0 ? -12 : 12, reverb: instrument.id === "erhu" || instrument.id === "dizi" ? 34 : 20,
      mute: false, solo: false, arm: index === 0, clips: [],
    }));
    commitTracks((current) => [...current.map((track) => ({ ...track, arm: false })), ...suite]);
    setSelectedTrackId(suite[0].id);
    setSelectedClipId("");
    setSelectedNoteId(null);
    setModal(null);
    void loadSampleInstrument(CHINESE_INSTRUMENTS[0]);
    notify(t.suiteAdded);
  }, [commitTracks, loadSampleInstrument, locale, notify, t, tracks.length]);

  const updateTrack = useCallback((trackId: string, patch: Partial<Track>, withHistory = true) => {
    const update = (current: Track[]) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track);
    if (withHistory) commitTracks(update); else setProject((current) => ({ ...current, tracks: update(current.tracks), updatedAt: Date.now() }));
  }, [commitTracks]);

  const setArmedTrack = useCallback((trackId: string) => {
    commitProject((current) => ({ ...current, tracks: current.tracks.map((track) => ({ ...track, arm: track.id === trackId ? !track.arm : false })) }));
    setSelectedTrackId(trackId);
    const preset = instrumentById(projectRef.current.tracks.find((track) => track.id === trackId)?.instrument ?? "grand");
    void loadSampleInstrument(preset);
  }, [commitProject, loadSampleInstrument]);

  const deleteSelectedTrack = useCallback(() => {
    if (tracks.length <= 1 || !selectedTrack) return;
    const index = tracks.findIndex((track) => track.id === selectedTrack.id);
    const fallback = tracks[Math.max(0, index - 1)];
    commitTracks((current) => current.filter((track) => track.id !== selectedTrack.id));
    setSelectedTrackId(fallback.id);
    setSelectedClipId(fallback.clips[0]?.id ?? "");
    setSelectedNoteId(null);
    notify(t.trackDeleted);
  }, [commitTracks, notify, selectedTrack, t, tracks]);

  const changeInstrument = useCallback((instrumentId: InstrumentId) => {
    const instrument = instrumentById(instrumentId);
    const localizedName = instrumentName(instrument, locale);
    const currentTrack = projectRef.current.tracks.find((track) => track.id === selectedTrackId);
    const channel = instrumentId === "drums" || instrumentId === "chinesePercussion" ? 9 : currentTrack?.channel === 9 ? Math.max(0, projectRef.current.tracks.findIndex((track) => track.id === selectedTrackId) % 16) : currentTrack?.channel ?? 0;
    updateTrack(selectedTrackId, { instrument: instrumentId, color: instrument.color, program: instrument.program, channel, name: locale === "en" ? localizedName.toUpperCase() : localizedName }, true);
    setOnboardingSoundChosen(true);
    void loadSampleInstrument(instrument);
  }, [loadSampleInstrument, locale, selectedTrackId, updateTrack]);

  const selectTrack = useCallback((track: Track) => {
    setSelectedTrackId(track.id);
    setSelectedClipId(track.clips[0]?.id ?? "");
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    const preset = instrumentById(track.instrument);
    void loadSampleInstrument(preset);
  }, [loadSampleInstrument]);

  const auditionInstrument = useCallback((instrument: Instrument) => {
    triggerNote(instrument.id === "bass" ? 48 : instrument.id === "drums" || instrument.id === "chinesePercussion" ? 36 : 60, 104, selectedTrackId, "preview", .8, instrument.id);
  }, [selectedTrackId, triggerNote]);

  const retryInstrumentSample = useCallback((instrument: Instrument) => {
    void loadSampleInstrument(instrument, true, true);
  }, [loadSampleInstrument]);

  const checkAllInstrumentSamples = useCallback(async () => {
    if (soundCheckRunning) return;
    setSoundCheckRunning(true);
    setSoundCheckProgress(0);
    let ready = 0;
    for (let index = 0; index < INSTRUMENTS.length; index += 1) {
      const anchors = await loadSampleInstrument(INSTRUMENTS[index], false);
      if (anchors.length) ready += 1;
      setSoundCheckProgress(index + 1);
    }
    setSoundCheckRunning(false);
    notify(t.sampleCheckComplete(ready));
  }, [loadSampleInstrument, notify, soundCheckRunning, t]);

  const dismissOnboarding = useCallback(() => {
    setOnboardingVisible(false);
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "complete");
  }, []);

  const closeMobilePanel = () => {
    setMobilePanel(null);
    if (mobileView === "mixer") setMobileView("performance");
  };

  const addEditorNote = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".roll-note")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const clipLength = selectedClip?.contentLengthTicks ?? barTicks(project.timeSignature);
    const tick = Math.min(clipLength - GRID_VALUES[grid], snapTick((event.clientX - bounds.left) / bounds.width * clipLength, grid));
    const row = Math.min(editorNotes.length - 1, Math.floor((event.clientY - bounds.top) / bounds.height * editorNotes.length));
    insertNoteAtSongTick(selectedTrackId, selectedClip?.id ?? null, (selectedClip?.startTick ?? currentTickRef.current) + tick, GRID_VALUES[stepLength], editorNotes[row], 96);
  }, [editorNotes, grid, insertNoteAtSongTick, project.timeSignature, selectedClip, selectedTrackId, stepLength]);

  const editSelectedNotes = useCallback((operation: "quantize" | "humanize" | "duplicate" | "delete" | "left" | "right" | "up" | "down") => {
    if (!selectedTrack || !selectedClip) return;
    const targets = selectedNoteIds.size ? selectedNoteIds : new Set(selectedNoteId ? [selectedNoteId] : []);
    let newSelection: string | null = null;
    commitTracks((current) => current.map((track) => track.id !== selectedTrack.id ? track : {
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id !== selectedClip.id) return clip;
        if (operation === "delete") return { ...clip, notes: clip.notes.filter((note) => !targets.has(note.id)) };
        if (operation === "duplicate") {
          const copies = clip.notes.filter((note) => targets.has(note.id)).map((note) => ({ ...note, id: uid("note"), tick: Math.min(clip.contentLengthTicks - note.durationTicks, note.tick + GRID_VALUES[grid]) }));
          newSelection = copies[0]?.id ?? null;
          return { ...clip, notes: [...clip.notes, ...copies] };
        }
        return {
          ...clip,
          notes: clip.notes.map((note) => {
            if (!targets.has(note.id)) return note;
            if (operation === "quantize") {
              const snapped = snapTick(note.tick, grid);
              const amount = quantizeStrength / 100;
              return { ...note, tick: Math.max(0, Math.round(note.tick + (snapped - note.tick) * amount)), durationTicks: Math.max(GRID_VALUES[grid], snapTick(note.durationTicks, grid)) };
            }
            if (operation === "humanize") return { ...note, tick: Math.max(0, note.tick + Math.round((Math.random() - .5) * GRID_VALUES[grid] * .25)), velocity: Math.max(35, Math.min(127, note.velocity + Math.round((Math.random() - .5) * 14))) };
            if (operation === "left") return { ...note, tick: Math.max(0, note.tick - GRID_VALUES[grid]) };
            if (operation === "right") return { ...note, tick: Math.min(clip.contentLengthTicks - note.durationTicks, note.tick + GRID_VALUES[grid]) };
            if (operation === "up") return { ...note, pitch: Math.min(127, note.pitch + 1) };
            if (operation === "down") return { ...note, pitch: Math.max(0, note.pitch - 1) };
            return note;
          }),
        };
      }),
    }));
    if (operation === "delete") { setSelectedNoteId(null); setSelectedNoteIds(new Set()); }
    if (newSelection) { setSelectedNoteId(newSelection); setSelectedNoteIds(new Set([newSelection])); }
  }, [commitTracks, grid, quantizeStrength, selectedClip, selectedNoteId, selectedNoteIds, selectedTrack]);

  const randomizeClip = useCallback(() => {
    if (!selectedTrack) return;
    const percussion = selectedTrack.instrument === "drums" || selectedTrack.instrument === "chinesePercussion";
    const pitches = percussion
      ? [36, 42, 38, 42, 36, 46]
      : selectedTrack.instrument === "bass"
        ? [36, 39, 41, 43, 46, 48]
        : [60, 62, 64, 67, 69, 72];

    if (selectedClip) {
      const requestedIds = selectedNoteIds.size
        ? selectedNoteIds
        : selectedNoteId
          ? new Set([selectedNoteId])
          : new Set<string>();
      const availableIds = new Set(selectedClip.notes.map((note) => note.id));
      const requestedTargets = new Set([...requestedIds].filter((id) => availableIds.has(id)));
      const targetIds = requestedTargets.size ? requestedTargets : availableIds;
      const nextNotes = selectedClip.notes.length
        ? randomizeNoteValues(selectedClip.notes, targetIds, pitches)
        : generateRandomNotes({ lengthTicks: selectedClip.contentLengthTicks, stepTicks: GRID_VALUES[stepLength], pitches, density: percussion ? .72 : .62 });
      commitTracks((current) => current.map((track) => track.id !== selectedTrack.id ? track : {
        ...track,
        clips: track.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, notes: nextNotes } : clip),
      }));
      const selectedIds = selectedClip.notes.length ? targetIds : new Set(nextNotes.map((note) => note.id));
      setSelectedNoteIds(new Set(selectedIds));
      setSelectedNoteId(selectedIds.values().next().value ?? null);
    } else {
      const lengthTicks = barTicks(project.timeSignature) * 2;
      const startTick = snapTick(currentTickRef.current, grid);
      const notes = generateRandomNotes({ lengthTicks, stepTicks: GRID_VALUES[stepLength], pitches, density: percussion ? .72 : .62 });
      const clip = createClip(startTick, lengthTicks, t.randomClipName, notes);
      commitProject((current) => ({
        ...current,
        lengthBars: requiredSongBars(current, startTick + lengthTicks),
        tracks: current.tracks.map((track) => track.id === selectedTrack.id ? { ...track, clips: [...track.clips, clip] } : track),
      }));
      setSelectedClipId(clip.id);
      setSelectedNoteIds(new Set(notes.map((note) => note.id)));
      setSelectedNoteId(notes[0]?.id ?? null);
    }
    setMobileView("roll");
    notify(t.randomIdeaCreated);
  }, [commitProject, commitTracks, grid, notify, project.timeSignature, selectedClip, selectedNoteId, selectedNoteIds, selectedTrack, stepLength, t]);

  const generateRandomSong = useCallback(() => {
    stopTransport();
    const generated = generateStyledArrangement({
      defaults: INSTRUMENT_DEFAULTS,
      sectionCount: randomSongSectionCount,
      style: randomSongStyle,
    });
    const localizedTracks = generated.tracks.map((track) => {
      const instrument = instrumentById(track.instrument);
      return {
        ...track,
        name: locale === "zh" ? instrument.nameZh : instrument.nameEn.toUpperCase(),
        clips: track.clips.map((clip) => {
          const section = generated.sections.find((item) => item.startTick === clip.startTick);
          return section ? { ...clip, name: `${sectionRoleName(section.role, locale)} · ${arrangementStyleName(section.style, locale)}` } : clip;
        }),
      };
    });
    const firstTrack = localizedTracks[0];
    currentTickRef.current = 0;
    setCurrentTick(0);
    commitProject((current) => ({
      ...current,
      bpm: generated.bpm,
      timeSignature: { numerator: 4, denominator: 4 },
      lengthBars: generated.lengthBars,
      loop: { enabled: false, startTick: 0, endTick: barTicks({ numerator: 4, denominator: 4 }) * 4 },
      sections: generated.sections,
      tracks: localizedTracks,
    }));
    setSelectedTrackId(firstTrack?.id ?? "");
    setSelectedClipId(firstTrack?.clips[0]?.id ?? "");
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    setTool("select");
    setMobileView("arrangement");
    setModal(null);
    if (firstTrack) void loadSampleInstrument(instrumentById(firstTrack.instrument), false);
    notify(t.randomSongCreated(generated.sections.length));
  }, [commitProject, loadSampleInstrument, locale, notify, randomSongSectionCount, randomSongStyle, stopTransport, t]);

  const newProject = useCallback(() => {
    stopTransport();
    const blankTracks = INITIAL_PROJECT.tracks.map((track) => ({ ...track, clips: [] }));
    const next = createEmptyProject(blankTracks, "UNTITLED SESSION");
    setProject(next);
    setSelectedTrackId(next.tracks[0].id);
    setSelectedClipId("");
    setHistory([]);
    setFuture([]);
    setCurrentTick(0);
    currentTickRef.current = 0;
    notify(t.projectCreated);
  }, [notify, stopTransport, t]);

  const saveProject = useCallback(async () => {
    await saveProjectDocument(projectRef.current);
    notify(t.projectSaved);
  }, [notify, t]);

  const exportProject = useCallback((type: "midi" | "json") => {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tuptup-session";
    if (type === "midi") downloadBlob(new Blob([makeProjectMidi(project)], { type: "audio/midi" }), `${safeName}.mid`);
    else downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${safeName}.tuptup.json`);
    notify(type === "midi" ? t.midiExported : t.bundleExported);
    setModal(null);
  }, [notify, project, projectName, t]);

  const importMidi = useCallback(async (file: File) => {
    try {
      let next: ProjectDocumentV3;
      if (file.name.toLowerCase().endsWith(".json")) {
        next = normalizeProjectV3(JSON.parse(await file.text()), INSTRUMENT_DEFAULTS);
      } else {
        const parsed = parseMidiFile(await file.arrayBuffer(), INSTRUMENTS.map((instrument) => ({ id: instrument.id, program: instrument.program, color: instrument.color, name: instrument.name })), INSTRUMENT_DEFAULTS);
        next = createEmptyProject(parsed.tracks, file.name.replace(/\.midi?$/i, "").toUpperCase());
        next.bpm = parsed.bpm;
        next.timeSignature = parsed.timeSignature;
        next.lengthBars = parsed.lengthBars;
        next.loop = { enabled: false, startTick: 0, endTick: barTicks(parsed.timeSignature) * 4 };
      }
      stopTransport();
      setHistory((items) => [...items.slice(-49), cloneProject(projectRef.current)]);
      setFuture([]);
      setProject(next);
      setSelectedTrackId(next.tracks[0]?.id ?? "");
      setSelectedClipId(next.tracks[0]?.clips[0]?.id ?? "");
      notify(t.midiImported(next.tracks.length));
    } catch {
      notify(t.midiImportFailed);
    }
  }, [notify, stopTransport, t]);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { triggerNoteRef.current = triggerNote; }, [triggerNote]);
  useEffect(() => { releaseLiveNoteRef.current = releaseLiveNote; }, [releaseLiveNote]);
  useEffect(() => { setSustainRef.current = setSustain; }, [setSustain]);
  useEffect(() => { metroRef.current = metronome; }, [metronome]);
  useEffect(() => { currentTickRef.current = currentTick; }, [currentTick]);
  useEffect(() => { recordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { stepInputRef.current = stepInput; }, [stepInput]);

  useEffect(() => {
    const master = masterGainRef.current;
    const context = audioContextRef.current;
    if (master && context) master.gain.setTargetAtTime(masterVolume / 100 * .7, context.currentTime, .025);
  }, [masterVolume]);

  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    const liveIds = new Set(project.tracks.map((track) => track.id));
    for (const [trackId, bus] of trackBusesRef.current) {
      const track = project.tracks.find((item) => item.id === trackId);
      if (!track) {
        bus.input.disconnect();
        bus.volume.disconnect();
        bus.pan.disconnect();
        bus.send.disconnect();
        trackBusesRef.current.delete(trackId);
        continue;
      }
      bus.volume.gain.setTargetAtTime(track.volume / 100, context.currentTime, .015);
      bus.pan.pan.setTargetAtTime(track.pan / 100, context.currentTime, .015);
      bus.send.gain.setTargetAtTime(track.reverb / 100 * .42, context.currentTime, .015);
    }
    for (const trackId of trackBusesRef.current.keys()) if (!liveIds.has(trackId)) trackBusesRef.current.delete(trackId);
  }, [project.tracks]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let restored = await loadLastProjectDocument();
        if (!restored) {
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) restored = normalizeProjectV3(JSON.parse(legacy), INSTRUMENT_DEFAULTS);
        }
        if (!active) return;
        if (restored) {
          const normalized = normalizeProjectV3(restored, INSTRUMENT_DEFAULTS);
          setProject(normalized);
          setSelectedTrackId(normalized.tracks[0]?.id ?? "");
          setSelectedClipId(normalized.tracks[0]?.clips[0]?.id ?? "");
        }
      } catch { /* keep the factory project when recovery data is damaged */ }
      finally { if (active) setProjectHydrated(true); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!projectHydrated) return;
    const timer = window.setTimeout(() => { void saveProjectDocument(project); }, 750);
    return () => window.clearTimeout(timer);
  }, [project, projectHydrated]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      const nextLocale: Locale = storedLocale === "zh" || storedLocale === "en"
        ? storedLocale
        : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
      setLocale(nextLocale);
      document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en";
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setOnboardingVisible(localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "complete"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const context = ensureAudio();
    scheduleTickRef.current = currentTickRef.current;
    scheduleTimeRef.current = context.currentTime + .035;
    displayTimeRef.current = context.currentTime;
    const tick = () => {
      const liveProject = projectRef.current;
      const horizon = context.currentTime + .12;
      const retained = new Set<string>([`${instrumentById(liveProject.tracks.find((track) => track.id === selectedTrackId)?.instrument ?? "grand").id}:`]);
      while (scheduleTimeRef.current < horizon) {
        const secondsSpan = Math.min(.025, horizon - scheduleTimeRef.current);
        const tickSpan = secondsToTicks(secondsSpan, liveProject.bpm, liveProject.ppq);
        for (const segment of scheduleSegments(liveProject, scheduleTickRef.current, tickSpan)) {
          const events = collectPlaybackEvents(liveProject, segment.fromTick, segment.toTick);
          for (const event of events) {
            retained.add(`${event.instrument}:`);
            const when = scheduleTimeRef.current + segment.secondsOffset + ticksToSeconds(event.tick - segment.fromTick, liveProject.bpm, liveProject.ppq);
            const duration = ticksToSeconds(event.durationTicks, liveProject.bpm, liveProject.ppq) * .98;
            triggerNoteRef.current(event.pitch, event.velocity, event.trackId, "sequence", duration, event.instrument as InstrumentId, when);
          }
          if (metroRef.current) {
            const beatTicks = liveProject.ppq * 4 / liveProject.timeSignature.denominator;
            const firstBeat = Math.ceil(segment.fromTick / beatTicks) * beatTicks;
            for (let beatTick = firstBeat; beatTick < segment.toTick; beatTick += beatTicks) {
              const when = scheduleTimeRef.current + segment.secondsOffset + ticksToSeconds(beatTick - segment.fromTick, liveProject.bpm, liveProject.ppq);
              clickMetronome(beatTick % barTicks(liveProject.timeSignature) === 0, when);
            }
          }
        }
        scheduleTickRef.current = advanceTransportTick(liveProject, scheduleTickRef.current, tickSpan);
        scheduleTimeRef.current += secondsSpan;
      }
      sampleLruRef.current.retain([...retained]);
      pruneEvictedSamples();
      const elapsed = Math.max(0, context.currentTime - displayTimeRef.current);
      displayTimeRef.current = context.currentTime;
      let displayTick = advanceTransportTick(liveProject, currentTickRef.current, secondsToTicks(elapsed, liveProject.bpm, liveProject.ppq));
      const endTick = songEndTick(liveProject);
      if (!liveProject.loop.enabled && displayTick >= endTick) {
        displayTick = endTick;
        currentTickRef.current = displayTick;
        setCurrentTick(displayTick);
        stopTransport();
        return;
      }
      currentTickRef.current = displayTick;
      setCurrentTick(displayTick);
      if (followPlayback && arrangementScrollRef.current) {
        const x = displayTick / barTicks(liveProject.timeSignature) * zoom;
        const viewport = arrangementScrollRef.current;
        if (x > viewport.scrollLeft + viewport.clientWidth * .8 || x < viewport.scrollLeft) viewport.scrollTo({ left: Math.max(0, x - viewport.clientWidth * .25), behavior: "smooth" });
      }
    };
    schedulerTimerRef.current = window.setInterval(tick, 25);
    tick();
    return () => {
      if (schedulerTimerRef.current) window.clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    };
  }, [clickMetronome, ensureAudio, followPlayback, isPlaying, pruneEvictedSamples, selectedTrackId, stopTransport, zoom]);

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
    midiControllerRef.current?.dispose();
    midiControllerRef.current = null;
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    void destroyAudioGraph(false);
  }, [destroyAudioGraph]);

  const pointerDown = (note: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    triggerNote(note, 104);
  };
  const pointerUp = (note: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    releaseLiveNote(note);
  };

  const seekToTick = (nextTick: number) => {
    const tick = Math.max(0, Math.min(projectEndTick, nextTick));
    currentTickRef.current = tick;
    setCurrentTick(tick);
    const context = audioContextRef.current;
    if (isPlaying && context) {
      scheduleTickRef.current = tick;
      scheduleTimeRef.current = context.currentTime + .035;
      displayTimeRef.current = context.currentTime;
      voicesRef.current.forEach((_, key) => { if (key.startsWith("sequence-")) stopVoice(key, true); });
    }
  };

  const setPlayhead = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    seekToTick(snapTick((event.clientX - bounds.left) / bounds.width * projectEndTick, grid));
  };

  const createClipOnLane = (trackId: string, event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".clip-block")) return;
    setPlayhead(event);
    if (tool !== "pencil" && event.detail < 2) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const startTick = snapTick((event.clientX - bounds.left) / bounds.width * projectEndTick, grid);
    const clip = createClip(startTick, barTicks(project.timeSignature), locale === "zh" ? "新片段" : "NEW CLIP");
    commitTracks((current) => current.map((track) => track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track));
    setSelectedTrackId(trackId);
    setSelectedClipId(clip.id);
    setSelectedNoteId(null);
  };

  const clipPointerDown = (trackId: string, clipId: string, mode: "move" | "left" | "right") => (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const liveClip = projectRef.current.tracks.find((track) => track.id === trackId)?.clips.find((clip) => clip.id === clipId);
    if (!liveClip) return;
    if (tool === "split" && mode === "move") {
      const bounds = event.currentTarget.getBoundingClientRect();
      const at = snapTick(liveClip.startTick + (event.clientX - bounds.left) / bounds.width * liveClip.displayLengthTicks, grid);
      const parts = splitClip(liveClip, at);
      if (parts) {
        commitTracks((current) => current.map((track) => track.id !== trackId ? track : { ...track, clips: track.clips.flatMap((clip) => clip.id === clipId ? parts : [clip]) }));
        setSelectedClipId(parts[1].id);
      }
      return;
    }
    setSelectedTrackId(trackId);
    setSelectedClipId(clipId);
    setSelectedNoteId(null);
    setSelectedNoteIds(new Set());
    const startX = event.clientX;
    const base = cloneProject(projectRef.current);
    const target = event.currentTarget;
    let changed = false;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      changed = true;
      const delta = Math.round(((moveEvent.clientX - startX) / zoom * barTicks(base.timeSignature)) / GRID_VALUES[grid]) * GRID_VALUES[grid];
      setProject(() => {
        const next = cloneProject(base);
        next.tracks = next.tracks.map((track) => track.id !== trackId ? track : {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            if (mode === "move") return { ...clip, startTick: Math.max(0, liveClip.startTick + delta) };
            if (mode === "left") {
              const applied = Math.max(-liveClip.startTick, Math.min(liveClip.displayLengthTicks - GRID_VALUES[grid], delta));
              const contentLengthTicks = clip.loopEnabled ? clip.contentLengthTicks : Math.max(GRID_VALUES[grid], clip.contentLengthTicks - applied);
              const notes = clip.loopEnabled ? clip.notes : clip.notes.map((note) => {
                const end = note.tick + note.durationTicks;
                return { ...note, tick: Math.max(0, note.tick - applied), durationTicks: note.tick < applied ? end - applied : note.durationTicks };
              }).filter((note) => note.durationTicks > 0 && note.tick < contentLengthTicks).map((note) => ({ ...note, durationTicks: Math.min(note.durationTicks, contentLengthTicks - note.tick) }));
              return { ...clip, startTick: liveClip.startTick + applied, displayLengthTicks: liveClip.displayLengthTicks - applied, contentLengthTicks, notes };
            }
            const length = Math.max(GRID_VALUES[grid], liveClip.displayLengthTicks + delta);
            return { ...clip, displayLengthTicks: length, contentLengthTicks: clip.loopEnabled ? clip.contentLengthTicks : length, notes: clip.loopEnabled ? clip.notes : clip.notes.filter((note) => note.tick < length).map((note) => ({ ...note, durationTicks: Math.min(note.durationTicks, length - note.tick) })) };
          }),
        });
        next.lengthBars = requiredSongBars(next, projectContentEnd(next));
        return next;
      });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (changed) {
        setHistory((items) => [...items.slice(-49), base]);
        setFuture([]);
      }
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up, { once: true });
  };

  const duplicateSelectedClip = () => {
    if (!selectedTrack || !selectedClip) return;
    const copy: MidiClipV3 = { ...selectedClip, id: uid("clip"), startTick: selectedClip.startTick + selectedClip.displayLengthTicks, notes: selectedClip.notes.map((note) => ({ ...note, id: uid("note") })) };
    commitTracks((current) => current.map((track) => track.id === selectedTrack.id ? { ...track, clips: [...track.clips, copy] } : track));
    setSelectedClipId(copy.id);
  };

  const deleteSelectedClip = () => {
    if (!selectedTrack || !selectedClip) return;
    commitTracks((current) => current.map((track) => track.id === selectedTrack.id ? { ...track, clips: track.clips.filter((clip) => clip.id !== selectedClip.id) } : track));
    setSelectedClipId("");
    setSelectedNoteId(null);
  };

  const notePointerDown = (note: MidiNoteV3, mode: "move" | "resize") => (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!selectedTrack || !selectedClip || !rollGridRef.current) return;
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const targets = additive
      ? new Set(selectedNoteIds.has(note.id) ? [...selectedNoteIds].filter((id) => id !== note.id) : [...selectedNoteIds, note.id])
      : selectedNoteIds.has(note.id) ? new Set(selectedNoteIds) : new Set([note.id]);
    if (!targets.size) targets.add(note.id);
    setSelectedNoteIds(targets);
    setSelectedNoteId(note.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const bounds = rollGridRef.current.getBoundingClientRect();
    const base = cloneProject(projectRef.current);
    const target = event.currentTarget;
    let changed = false;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      changed = true;
      const tickDelta = Math.round(((moveEvent.clientX - startX) / bounds.width * selectedClip.contentLengthTicks) / GRID_VALUES[grid]) * GRID_VALUES[grid];
      const pitchDelta = mode === "move" ? Math.round(-(moveEvent.clientY - startY) / bounds.height * editorNotes.length) : 0;
      setProject(() => {
        const next = cloneProject(base);
        next.tracks = next.tracks.map((track) => track.id !== selectedTrack.id ? track : {
          ...track,
          clips: track.clips.map((clip) => clip.id !== selectedClip.id ? clip : {
            ...clip,
            notes: clip.notes.map((item) => {
              if (!targets.has(item.id)) return item;
              if (mode === "resize") return { ...item, durationTicks: Math.max(GRID_VALUES[grid], Math.min(clip.contentLengthTicks - item.tick, item.durationTicks + tickDelta)) };
              return { ...item, tick: Math.max(0, Math.min(clip.contentLengthTicks - item.durationTicks, item.tick + tickDelta)), pitch: Math.max(0, Math.min(127, item.pitch + pitchDelta)) };
            }),
          }),
        });
        return next;
      });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (changed) {
        setHistory((items) => [...items.slice(-49), base]);
        setFuture([]);
      }
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up, { once: true });
  };

  const rollPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".roll-note")) return;
    if (tool === "pencil" || event.detail > 1) { addEditorNote(event); return; }
    if (!selectedClip) { addEditorNote(event); return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    const startX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const startY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const endX = Math.max(0, Math.min(bounds.width, moveEvent.clientX - bounds.left));
      const endY = Math.max(0, Math.min(bounds.height, moveEvent.clientY - bounds.top));
      setMarquee({ left: Math.min(startX, endX) / bounds.width * 100, top: Math.min(startY, endY) / bounds.height * 100, width: Math.abs(endX - startX) / bounds.width * 100, height: Math.abs(endY - startY) / bounds.height * 100 });
    };
    const up = (upEvent: PointerEvent) => {
      const endX = Math.max(0, Math.min(bounds.width, upEvent.clientX - bounds.left));
      const endY = Math.max(0, Math.min(bounds.height, upEvent.clientY - bounds.top));
      const left = Math.min(startX, endX) / bounds.width;
      const right = Math.max(startX, endX) / bounds.width;
      const top = Math.min(startY, endY) / bounds.height;
      const bottom = Math.max(startY, endY) / bounds.height;
      const ids = selectedClip.notes.filter((note) => {
        const x1 = note.tick / selectedClip.contentLengthTicks;
        const x2 = (note.tick + note.durationTicks) / selectedClip.contentLengthTicks;
        const y1 = (EDITOR_HIGH - note.pitch) / editorNotes.length;
        const y2 = y1 + 1 / editorNotes.length;
        return x2 >= left && x1 <= right && y2 >= top && y1 <= bottom;
      }).map((note) => note.id);
      setSelectedNoteIds(new Set(ids));
      setSelectedNoteId(ids[0] ?? null);
      setMarquee(null);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up, { once: true });
  };

  const baseComputerNote = (octave + 1) * 12;

  return (
    <main className="studio-shell" data-mobile-view={mobileView}>
      <header className="app-header">
        <button className="brand" onClick={() => notify(t.brandToast)} aria-label="TupTup Studio">
          <span className="brand-emblem" aria-hidden="true"><i /><i /><i /></span>
          <span><b>TUPTUP</b><small>STUDIO</small></span>
        </button>
        <div className="project-title">
          <span>{t.project.toUpperCase()}</span>
          <input value={projectName} onChange={(event) => setProject((current) => ({ ...current, name: event.target.value.toUpperCase(), updatedAt: Date.now() }))} aria-label={t.projectName} />
          <i aria-hidden="true">●</i>
        </div>
        <nav className="header-actions" aria-label={t.projectActions}>
          <button onClick={newProject}>{t.newProject}</button>
          <button onClick={() => importInputRef.current?.click()}>{t.importMidi}</button>
          <button onClick={saveProject}>{t.save}</button>
          <button className="accent-button" onClick={() => setModal("export")}>{t.export}</button>
          <button className={`device-button ${connection === "connected" ? "online" : ""}`} onClick={() => setDeviceDrawer(true)}>
            <i /> {connection === "connected" ? t.midiOnline : t.connectDevice}
          </button>
          <a className="guide-link" href="/guide" aria-label={t.openGuide}><b>?</b><span>{t.guide}</span></a>
          <button className="language-toggle" onClick={() => changeLocale(locale === "zh" ? "en" : "zh")} aria-label={t.switchLanguage} title={t.switchLanguage}>
            <b>{locale === "zh" ? "中" : "EN"}</b><span>/</span><small>{locale === "zh" ? "EN" : "中"}</small>
          </button>
        </nav>
        <input ref={importInputRef} className="visually-hidden" type="file" accept=".mid,.midi,.tuptup.json,application/json,audio/midi" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importMidi(file); event.currentTarget.value = ""; }} />
      </header>

      <section className="transport" aria-label={t.transport}>
        <div className="transport-left">
          <button className="mobile-toggle" onClick={() => setMobilePanel("library")} aria-label={t.openLibrary}>☰</button>
          <button onClick={undo} disabled={!history.length} aria-label={t.undo}>↶</button>
          <button onClick={redo} disabled={!future.length} aria-label={t.redo}>↷</button>
          <span className="transport-divider" />
          <button className={metronome ? "active-control" : ""} onClick={() => setMetronome((value) => !value)} aria-pressed={metronome} title={`${t.metronome} (M)`}>⌁<small>{locale === "zh" ? "节拍" : "CLICK"}</small></button>
          <label className="tempo-control"><span>{t.tempo.toUpperCase()}</span><input aria-label={t.tempo} type="number" min="40" max="240" value={bpm} onChange={(event) => commitProject((current) => ({ ...current, bpm: Math.max(40, Math.min(240, Number(event.target.value) || 40)) }))} /><b>BPM</b></label>
          <button className={countIn ? "active-control" : ""} onClick={() => setCountIn((value) => !value)} title={t.countIn}>1·2</button>
        </div>
        <div className="transport-center">
          <button onClick={() => seekToTick(0)} aria-label={t.returnStart}>|◀</button>
          <button className="play-button" onClick={togglePlay} aria-label={isPlaying ? t.pause : t.play}>{isPlaying ? "Ⅱ" : "▶"}</button>
          <button className={`record-button ${isRecording || countingIn ? "recording" : ""}`} onClick={toggleRecord} aria-label={isRecording ? t.stopRecording : t.record}><i /></button>
          <div className="time-display"><strong>{measure}.{beat}.{subdivision}</strong><span>{locale === "zh" ? "小节 · 拍 · 格" : "BAR · BEAT · STEP"}</span></div>
        </div>
        <div className="transport-right">
          <button className={looping ? "active-control" : ""} onClick={() => commitProject((current) => ({ ...current, loop: { ...current.loop, enabled: !current.loop.enabled } }))} aria-pressed={looping} aria-label={t.loop}>↻<small>{t.loop.toUpperCase()}</small></button>
          <label className="master-control"><span>{t.master.toUpperCase()}</span><input aria-label={t.master} type="range" min="0" max="100" value={masterVolume} onPointerDown={beginProjectGesture} onPointerUp={endProjectGesture} onPointerCancel={endProjectGesture} onChange={(event) => setProject((current) => ({ ...current, masterVolume: Number(event.target.value), updatedAt: Date.now() }))} /><b>{masterVolume}</b></label>
          <button onClick={() => setModal("audio")} aria-label={t.audioSettings}>⚙</button>
          <button className="mobile-toggle" onClick={() => setMobilePanel("mixer")} aria-label={t.openMixer}>◫</button>
        </div>
      </section>

      <nav className="mobile-workspace-tabs" aria-label={locale === "zh" ? "移动工作区" : "Mobile workspace"}>
        {(["arrangement", "roll", "performance", "mixer"] as const).map((view) => <button key={view} className={mobileView === view ? "selected" : ""} onClick={() => { setMobileView(view); if (view === "mixer") setMobilePanel("mixer"); }}>{view === "arrangement" ? `▦ ${t.arrangement}` : view === "roll" ? `▤ ${t.pianoRoll}` : view === "performance" ? `♪ ${locale === "zh" ? "演奏" : "Play"}` : `◫ ${locale === "zh" ? "混音" : "Mix"}`}</button>)}
      </nav>

      {onboardingVisible && <aside className={`onboarding-coach ${onboardingComplete ? "complete" : ""}`} aria-label={t.firstLoop}>
        <div className="coach-heading">
          <div><span>{t.startHere.toUpperCase()}</span><strong>{t.firstLoop}</strong><p>{t.beginnerHint}</p></div>
          <button onClick={dismissOnboarding} aria-label={t.hideCoach} title={t.hideCoach}>×</button>
        </div>
        <div className="coach-steps">
          <button className={onboardingSoundChosen ? "done" : ""} onClick={() => setMobilePanel("library")}><i>{onboardingSoundChosen ? "✓" : "1"}</i><span>{t.chooseASound}</span><b>→</b></button>
          <button className={onboardingClipReady ? "done" : ""} onClick={() => { setTool("pencil"); setMobileView("arrangement"); }}><i>{onboardingClipReady ? "✓" : "2"}</i><span>{locale === "zh" ? "创建或录制片段" : "Create or record a clip"}</span><b>＋</b></button>
          <button className={onboardingInputReady ? "done" : ""} onClick={() => { stepInputRef.current = true; setStepInput(true); setMobileView("roll"); }}><i>{onboardingInputReady ? "✓" : "3"}</i><span>{locale === "zh" ? "打开卷帘并录入" : "Open the roll and enter notes"}</span><b>→</b></button>
          <button className={onboardingPlayed ? "done" : ""} onClick={() => { setMobileView("performance"); document.querySelector<HTMLButtonElement>(".piano-key.white")?.focus(); }}><i>{onboardingPlayed ? "✓" : "4"}</i><span>{locale === "zh" ? "播放完整歌曲" : "Play the song"}</span><b>♪</b></button>
        </div>
        {onboardingComplete && <button className="coach-finish" onClick={dismissOnboarding}>✓ {t.onboardingDone}</button>}
      </aside>}

      <section className="workspace">
        <aside className={`library-panel ${mobilePanel === "library" ? "mobile-open" : ""}`}>
          <div className="panel-heading"><div><span>{t.browser.toUpperCase()}</span><strong>{t.libraryTitle}</strong></div><div className="panel-heading-actions"><button className="sound-check-trigger" onClick={() => setModal("sound-check")} aria-label={t.openSoundCheck} title={t.soundCheck}>✓ 17</button><button className="panel-close" onClick={closeMobilePanel} aria-label={t.closePanel}>×</button></div></div>
          <div className="instrument-library">
            <div className="library-group"><span>{t.studioCollection.toUpperCase()} · {CORE_INSTRUMENTS.length}</span></div>
            {CORE_INSTRUMENTS.map((instrument) => <div className={`instrument-row ${selectedTrack?.instrument === instrument.id ? "selected" : ""}`} data-instrument-id={instrument.id} data-sample-status={statusFor(instrument.id)} key={instrument.id}>
              <button className="instrument-select" onClick={() => { changeInstrument(instrument.id); setMobilePanel(null); }}>
                <i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrumentName(instrument, locale)}</strong><small>{instrumentFamily(instrument, locale)} · {statusLabel(instrument.id)}</small></span><b className={statusFor(instrument.id)}>{statusIcon(instrument.id)}</b>
              </button>
              <button className="instrument-preview" onClick={() => auditionInstrument(instrument)} aria-label={`${t.previewSound} · ${instrumentName(instrument, locale)}`} title={t.previewSound}>▶</button>
            </div>)}
            <div className="library-group chinese"><span>{t.chineseCollection.toUpperCase()} · {CHINESE_INSTRUMENTS.length}</span><div><button onClick={() => setModal("samples")}>{t.credits}</button><button onClick={addChineseSuite}>＋ {t.fullSuite}</button></div></div>
            {CHINESE_INSTRUMENTS.map((instrument) => <div className={`instrument-row sample-instrument ${selectedTrack?.instrument === instrument.id ? "selected" : ""}`} data-instrument-id={instrument.id} data-sample-status={statusFor(instrument.id)} key={instrument.id}>
              <button className="instrument-select" onClick={() => { changeInstrument(instrument.id); setMobilePanel(null); }}>
                <i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrumentName(instrument, locale)}</strong><small>{instrumentFamily(instrument, locale)} · {statusLabel(instrument.id)}</small></span><b className={statusFor(instrument.id)}>{statusIcon(instrument.id)}</b>
              </button>
              <button className="instrument-preview" onClick={() => auditionInstrument(instrument)} aria-label={`${t.previewSound} · ${instrumentName(instrument, locale)}`} title={t.previewSound}>▶</button>
            </div>)}
          </div>
        </aside>

        <section className="center-stage">
          <div className="arrangement-panel">
            <div className="section-bar">
              <div><span>{t.arrangement.toUpperCase()}</span><strong>{t.arrangementTitle}</strong></div>
              <div className="editing-tools">
                <button className="random-song-button" onClick={() => setModal("random-song")} title={t.randomSongHint}>✦ {t.randomSong}</button>
                <button className={tool === "select" ? "selected" : ""} onClick={() => setTool("select")} title={t.selectTool}>↖</button><button className={tool === "pencil" ? "selected" : ""} onClick={() => setTool("pencil")} title={t.pencilTool}>✎</button><button className={tool === "split" ? "selected" : ""} onClick={() => setTool("split")} title={t.splitTool}>／</button>
                <span />
                <label>{t.grid.toUpperCase()} <select aria-label={t.gridAccuracy} value={grid} onChange={(event) => setGrid(event.target.value as GridValue)}>{Object.keys(GRID_VALUES).map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>{locale === "zh" ? "拍号" : "METER"} <select aria-label={locale === "zh" ? "拍号" : "Meter"} value={`${project.timeSignature.numerator}/${project.timeSignature.denominator}`} onChange={(event) => { const [numerator, denominator] = event.target.value.split("/").map(Number); commitProject((current) => ({ ...current, timeSignature: { numerator, denominator: denominator as 2 | 4 | 8 | 16 } })); }}>{["3/4", "4/4", "5/4", "6/8", "7/8"].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>LOOP <input className="loop-bar-input" type="number" min="1" max={project.lengthBars} value={Math.floor(project.loop.startTick / barTicks(project.timeSignature)) + 1} onChange={(event) => { const startTick = (Math.max(1, Number(event.target.value)) - 1) * barTicks(project.timeSignature); commitProject((current) => ({ ...current, loop: { ...current.loop, startTick: Math.min(startTick, current.loop.endTick - GRID_VALUES[grid]) } })); }} />–<input className="loop-bar-input" type="number" min="1" max={project.lengthBars} value={Math.ceil(project.loop.endTick / barTicks(project.timeSignature))} onChange={(event) => { const endTick = Math.max(1, Number(event.target.value)) * barTicks(project.timeSignature); commitProject((current) => ({ ...current, loop: { ...current.loop, endTick: Math.max(endTick, current.loop.startTick + GRID_VALUES[grid]) } })); }} /></label>
                <label className="zoom-control">ZOOM <input type="range" min="32" max="160" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
                <button className={followPlayback ? "selected" : ""} onClick={() => setFollowPlayback((value) => !value)} title={locale === "zh" ? "播放跟随" : "Follow playhead"}>⇥</button>
                <button disabled={!selectedClip} onClick={duplicateSelectedClip} title={t.duplicate}>⧉</button>
                <button disabled={!selectedClip} onClick={deleteSelectedClip} title={t.delete}>⌫</button>
                <button onClick={() => setModal("shortcuts")} aria-label={t.keyCommands}>?</button>
              </div>
            </div>
            <div className="arrangement-scroll" ref={arrangementScrollRef}>
              <div className="arrangement-canvas" style={{ width: 228 + timelineWidth }}>
              <div className="ruler-row">
                <div className="track-label-header"><span>{t.tracks.toUpperCase()}</span><button onClick={() => setModal("new-track")}>＋ {t.add.toUpperCase()}</button></div>
                <div className="ruler-grid" style={{ width: timelineWidth, backgroundSize: `${zoom / 4}px 100%` }} onPointerDown={setPlayhead}>
                  {project.sections.map((section) => <div className="song-section-marker" key={section.id} title={`${sectionRoleName(section.role, locale)} · ${arrangementStyleName(section.style, locale)} · ${section.instruments.map((id) => instrumentName(instrumentById(id), locale)).join(" / ")}`} style={{ left: section.startTick / barTicks(project.timeSignature) * zoom, width: section.lengthTicks / barTicks(project.timeSignature) * zoom, borderColor: section.color, background: `color-mix(in srgb, ${section.color} 15%, #111318)` }}><strong>{sectionRoleName(section.role, locale)}</strong><small>{arrangementStyleName(section.style, locale)}</small></div>)}
                  {Array.from({ length: project.lengthBars }, (_, bar) => <span key={bar} style={{ left: bar * zoom, width: zoom }}>{bar + 1}</span>)}
                  <i className="loop-range" style={{ left: project.loop.startTick / barTicks(project.timeSignature) * zoom, width: (project.loop.endTick - project.loop.startTick) / barTicks(project.timeSignature) * zoom }} />
                </div>
              </div>
              <div className="track-lanes">
                <div className="playhead" style={{ left: 228 + currentTick / barTicks(project.timeSignature) * zoom }}><i /><span /></div>
                {tracks.map((track, index) => (
                  <div className={`track-lane ${track.id === selectedTrackId ? "selected" : ""}`} key={track.id}>
                    <div className="track-label" role="button" tabIndex={0} onClick={() => selectTrack(track)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectTrack(track); } }}>
                      <span className="track-index" style={{ color: track.color }}>{String(index + 1).padStart(2, "0")}</span>
                      <i className="track-color" style={{ background: track.color }} />
                      <div><strong>{track.name}</strong><small>{instrumentFamily(instrumentById(track.instrument), locale)} · CH {index + 1}</small></div>
                      <button className={track.mute ? "engaged" : ""} aria-label={`${track.name} · ${t.mute}`} onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { mute: !track.mute }); }}>M</button>
                      <button className={track.solo ? "engaged solo" : ""} aria-label={`${track.name} · ${t.solo}`} onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }}>S</button>
                      <button className={track.arm ? "armed" : ""} aria-label={`${track.name} · ${t.arm}`} onClick={(event) => { event.stopPropagation(); setArmedTrack(track.id); }}>●</button>
                    </div>
                    <div className="lane-grid" style={{ width: timelineWidth, backgroundSize: `${zoom / 4}px 100%` }} onPointerDown={(event) => createClipOnLane(track.id, event)}>
                      {track.clips.map((clip) => <button key={clip.id} className={`clip-block ${clip.id === selectedClipId ? "selected" : ""} ${clip.loopEnabled ? "looped" : ""}`} style={{ left: clip.startTick / barTicks(project.timeSignature) * zoom, width: Math.max(8, clip.displayLengthTicks / barTicks(project.timeSignature) * zoom), borderColor: track.color, background: `color-mix(in srgb, ${track.color} 17%, #15171d)` }} onPointerDown={clipPointerDown(track.id, clip.id, "move")} onDoubleClick={(event) => { event.stopPropagation(); setMobileView("roll"); }}>
                        <span>{clip.name} · {clip.notes.length} {t.notes.toUpperCase()}</span>
                        <i className="clip-handle left" onPointerDown={clipPointerDown(track.id, clip.id, "left")} />
                        {clip.notes.slice(0, 300).map((note) => <i className="clip-note" key={note.id} style={{ left: `${note.tick / clip.contentLengthTicks * 100}%`, width: `${Math.max(1, note.durationTicks) / clip.contentLengthTicks * 100}%`, top: `${12 + ((84 - note.pitch + 120) % 7) * 4}px`, background: track.color }} />)}
                        <i className="clip-handle right" onPointerDown={clipPointerDown(track.id, clip.id, "right")} />
                      </button>)}
                    </div>
                  </div>
                ))}
                <button className="add-lane" onClick={() => setModal("new-track")}>＋ {t.addInstrumentTrack}</button>
              </div>
              </div>
            </div>
          </div>

          <div className="piano-roll-panel">
            <div className="editor-toolbar">
              <div><span>{t.pianoRoll.toUpperCase()}</span><strong>{selectedClip ? `${selectedTrack?.name} · ${selectedClip.name}` : (locale === "zh" ? "演奏第一颗音符以创建片段" : "Play a note to create a clip")}</strong></div>
              <div>
                <button className="randomize-button" onClick={randomizeClip} title={t.randomizeHint}>✦ {t.randomize}</button>
                <button onClick={() => editSelectedNotes("quantize")}>{t.quantize}</button>
                <label className="quantize-strength"><span>{quantizeStrength}%</span><input type="range" min="0" max="100" value={quantizeStrength} onChange={(event) => setQuantizeStrength(Number(event.target.value))} /></label>
                <button onClick={() => editSelectedNotes("humanize")}>{t.humanize}</button>
                <button onClick={() => editSelectedNotes("duplicate")} disabled={!selectedNote}>{t.duplicate}</button>
                <button onClick={() => editSelectedNotes("delete")} disabled={!selectedNote}>{t.delete}</button>
                <button className={selectedClip?.loopEnabled ? "engaged" : ""} disabled={!selectedClip} onClick={() => selectedClip && commitTracks((current) => current.map((track) => track.id !== selectedTrackId ? track : { ...track, clips: track.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, loopEnabled: !clip.loopEnabled } : clip) }))}>↻ CLIP</button>
                <span className="velocity-chip">VEL {selectedNote?.velocity ?? "—"}</span>
              </div>
            </div>
            <div className="roll-input-bar">
              <button className={stepInput ? "engaged" : ""} aria-pressed={stepInput} onClick={() => setStepInput((enabled) => { const next = !enabled; stepInputRef.current = next; return next; })}><i />{t.stepInput}</button>
              <label>{locale === "zh" ? "步长" : "LENGTH"}<select value={stepLength} onChange={(event) => setStepLength(event.target.value as GridValue)}>{Object.keys(GRID_VALUES).map((value) => <option key={value}>{value}</option>)}</select></label>
              <p><strong>{t.stepInputHint}</strong><span>{t.liveRecordHint}</span></p>
              <a href="/guide#roll-input">{t.learnMore} ↗</a>
            </div>
            <div className="roll-body" ref={rollBodyRef} onScroll={(event) => setRollViewport({ left: Math.max(0, event.currentTarget.scrollLeft - 48), width: event.currentTarget.clientWidth - 48 })}>
              <div className="roll-key-labels" aria-hidden="true">
                {editorNotes.map((note) => <span className={isBlack(note) ? "black" : ""} key={note}>{note % 12 === 0 ? noteName(note) : ""}</span>)}
              </div>
              <div className="roll-grid" ref={rollGridRef} style={{ width: rollCanvasWidth }} onPointerDown={rollPointerDown} aria-label={t.rollHelp}>
                {Array.from({ length: Math.min(256, Math.max(1, Math.ceil((selectedClip?.contentLengthTicks ?? barTicks(project.timeSignature)) / GRID_VALUES[grid]))) }, (_, i) => <i key={i} className={(i * GRID_VALUES[grid]) % PPQ === 0 ? "beat" : ""} style={{ left: `${i * GRID_VALUES[grid] / (selectedClip?.contentLengthTicks ?? barTicks(project.timeSignature)) * 100}%` }} />)}
                {editorNotes.map((note, i) => <span key={note} className={isBlack(note) ? "black-row" : ""} style={{ top: `${i / editorNotes.length * 100}%`, height: `${100 / editorNotes.length}%` }} />)}
                {selectedClip && currentTick >= selectedClip.startTick && currentTick <= selectedClip.startTick + selectedClip.displayLengthTicks && <div className="roll-playhead" style={{ left: `${((currentTick - selectedClip.startTick) % selectedClip.contentLengthTicks) / selectedClip.contentLengthTicks * 100}%` }} />}
                {marquee && <div className="roll-marquee" style={{ left: `${marquee.left}%`, top: `${marquee.top}%`, width: `${marquee.width}%`, height: `${marquee.height}%` }} />}
                {selectedClip?.notes.filter((note) => note.pitch >= EDITOR_LOW && note.pitch <= EDITOR_HIGH && note.tick + note.durationTicks >= rollVisibleRange.from && note.tick <= rollVisibleRange.to).map((note) => (
                  <button key={note.id} className={`roll-note ${selectedNoteIds.has(note.id) || selectedNoteId === note.id ? "selected" : ""}`} style={{ left: `${note.tick / selectedClip.contentLengthTicks * 100}%`, width: `${Math.max(1, note.durationTicks) / selectedClip.contentLengthTicks * 100}%`, top: `${(EDITOR_HIGH - note.pitch) / editorNotes.length * 100}%`, height: `${100 / editorNotes.length}%`, background: selectedTrack.color }} onPointerDown={notePointerDown(note, "move")} onDoubleClick={() => { setSelectedNoteId(note.id); setSelectedNoteIds(new Set([note.id])); editSelectedNotes("delete"); }} aria-label={`${noteName(note.pitch)}, ${t.stepLabel(Math.round(note.tick / STEP_TICKS) + 1)}`}><i onPointerDown={notePointerDown(note, "resize")} /></button>
                ))}
              </div>
            </div>
            <div className="velocity-lane" aria-label={t.velocity}>
              <span>{t.velocity.toUpperCase()}</span>
              <div>{selectedClip?.notes.filter((note) => note.tick + note.durationTicks >= rollVisibleRange.from && note.tick <= rollVisibleRange.to).map((note) => <button key={note.id} className={selectedNoteIds.has(note.id) ? "selected" : ""} style={{ left: `${(note.tick - rollVisibleRange.from) / Math.max(1, rollVisibleRange.to - rollVisibleRange.from) * 100}%`, height: `${note.velocity / 127 * 100}%`, background: selectedTrack.color }} onPointerDown={(event) => { event.stopPropagation(); const bounds = event.currentTarget.parentElement!.getBoundingClientRect(); const velocity = Math.max(1, Math.min(127, Math.round((bounds.bottom - event.clientY) / bounds.height * 127))); commitTracks((current) => current.map((track) => track.id !== selectedTrackId ? track : { ...track, clips: track.clips.map((clip) => clip.id !== selectedClip.id ? clip : { ...clip, notes: clip.notes.map((item) => item.id === note.id ? { ...item, velocity } : item) }) })); }} aria-label={`${t.velocity} ${note.velocity}`} />)}</div>
            </div>
          </div>

          <div className="performance-panel">
            <div className="performance-strip">
              <div><span>{t.liveInput.toUpperCase()}</span><strong>{instrumentName(selectedInstrument, locale)}</strong><small>{selectedInstrument.sample.source} · {statusLabel(selectedInstrument.id).toUpperCase()}</small></div>
              <div className="note-monitor"><b>{lastNote === null ? "—" : noteName(lastNote)}</b><span>{t.note.toUpperCase()}</span></div>
              <div className="velocity-monitor"><span>{t.velocity.toUpperCase()} <b>{String(lastVelocity).padStart(3, "0")}</b></span><i><b style={{ width: `${lastVelocity / 127 * 100}%` }} /></i></div>
              <div className="octave-switch"><span>{t.octave.toUpperCase()}</span><button onClick={() => setOctave((value) => Math.max(2, value - 1))}>−</button><b>{octave}</b><button onClick={() => setOctave((value) => Math.min(6, value + 1))}>＋</button></div>
              <div className={`sustain-light ${sustain ? "active" : ""}`}><i />{t.sustain.toUpperCase()}<small>SHIFT</small></div>
            </div>
            <div className="keyboard-scroll">
              <div className="keyboard" role="group" aria-label={t.keyboardLabel}>
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
          <div className="panel-heading"><div><span>{t.channelStrip.toUpperCase()}</span><strong>{t.trackMixer}</strong></div><button className="panel-close" onClick={closeMobilePanel} aria-label={t.closePanel}>×</button></div>
          <div className="channel-identity"><i style={{ background: selectedTrack?.color }} /> <div><span>{t.selectedTrack.toUpperCase()}</span><input value={selectedTrack?.name ?? ""} onChange={(event) => updateTrack(selectedTrackId, { name: event.target.value.toUpperCase() })} aria-label={t.trackName} /></div><b>{String(tracks.findIndex((track) => track.id === selectedTrackId) + 1).padStart(2, "0")}</b></div>
          <div className="channel-controls">
            <label><span>{t.pan.toUpperCase()}</span><input type="range" min="-100" max="100" value={selectedTrack?.pan ?? 0} onPointerDown={beginProjectGesture} onPointerUp={endProjectGesture} onPointerCancel={endProjectGesture} onChange={(event) => updateTrack(selectedTrackId, { pan: Number(event.target.value) }, false)} /><b>{selectedTrack?.pan === 0 ? "C" : selectedTrack && selectedTrack.pan < 0 ? `L${Math.abs(selectedTrack.pan)}` : `R${selectedTrack?.pan}`}</b></label>
            <label><span>{t.reverb.toUpperCase()}</span><input type="range" min="0" max="100" value={selectedTrack?.reverb ?? 0} onPointerDown={beginProjectGesture} onPointerUp={endProjectGesture} onPointerCancel={endProjectGesture} onChange={(event) => updateTrack(selectedTrackId, { reverb: Number(event.target.value) }, false)} /><b>{selectedTrack?.reverb ?? 0}</b></label>
            <div className="fader-wrap"><div className="meter-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><input className="vertical-fader" type="range" min="0" max="100" value={selectedTrack?.volume ?? 0} onPointerDown={beginProjectGesture} onPointerUp={endProjectGesture} onPointerCancel={endProjectGesture} onChange={(event) => updateTrack(selectedTrackId, { volume: Number(event.target.value) }, false)} /><div className="db-scale"><span>0</span><span>-6</span><span>-12</span><span>-24</span><span>-∞</span></div></div>
            <div className="channel-buttons"><button className={selectedTrack?.mute ? "engaged" : ""} onClick={() => updateTrack(selectedTrackId, { mute: !selectedTrack?.mute })}>{t.mute.toUpperCase()}</button><button className={selectedTrack?.solo ? "engaged solo" : ""} onClick={() => updateTrack(selectedTrackId, { solo: !selectedTrack?.solo })}>{t.solo.toUpperCase()}</button><button className={selectedTrack?.arm ? "armed" : ""} onClick={() => setArmedTrack(selectedTrackId)}>● {t.arm.toUpperCase()}</button></div>
          </div>
          <button className="delete-track" disabled={tracks.length <= 1} onClick={deleteSelectedTrack}>{t.deleteTrack}</button>
        </aside>
      </section>

      <footer className="status-bar"><span><i className={connection === "connected" ? "online" : ""} /> {t.audioEngine.toUpperCase()} · {audioInfo ? audioInfo.sampleRate / 1000 : "—"} KHZ</span><button className="coach-toggle" onClick={() => setOnboardingVisible(true)}>◎ {t.startHere.toUpperCase()}</button><span>{t.polyphony.toUpperCase()} {voiceCount}/64</span><span>MIDI RX {String(midiEventCount).padStart(4, "0")}</span><span>{t.autosave.toUpperCase()}</span><span className="cpu">CPU <i><b style={{ width: `${Math.min(90, 12 + voiceCount * 6)}%` }} /></i></span></footer>

      {deviceDrawer && <div className="scrim" onPointerDown={() => setDeviceDrawer(false)} />}
      <aside className={`device-drawer ${deviceDrawer ? "open" : ""}`} aria-hidden={!deviceDrawer}>
        <div className="drawer-head"><div><span>{t.hardware.toUpperCase()}</span><strong>{t.midiDevice}</strong></div><button onClick={() => setDeviceDrawer(false)} aria-label={t.closePanel}>×</button></div>
        <div className={`device-hero ${connection}`}><div className="midi-port"><i /><i /><i /><i /><i /></div><div><span>{connection === "connected" ? t.connected.toUpperCase() : t.readyToConnect.toUpperCase()}</span><strong>{deviceName}</strong><p>{deviceMessage}</p></div></div>
        <button className="primary-action" onClick={connectMidi} disabled={connection === "searching"}>{connection === "searching" ? t.searchingDevices : connection === "connected" ? t.rescanMidi : t.connectMidiKeyboard}</button>
        <div className="device-info"><div><span>{t.inputMode.toUpperCase()}</span><b>{t.allChannels.toUpperCase()}</b></div><div><span>{t.latency.toUpperCase()}</span><b>{t.interactive.toUpperCase()}</b></div><div><span>{t.dataPrivacy.toUpperCase()}</span><b>{t.localOnly.toUpperCase()}</b></div></div>
        {(connection === "blocked" || connection === "error") && <div className="device-warning"><strong>{t.desktopBrowserRequired}</strong><p>{t.usbPreviewWarning}</p><button onClick={() => { void navigator.clipboard.writeText(PUBLIC_SITE_URL); notify(t.siteLinkCopied); }}>{t.copySiteLink}</button></div>}
        <div className="midi-map"><span>{t.controllerMap.toUpperCase()}</span><p><kbd>CC 64</kbd> {t.sustainPedal}</p><p><kbd>Note</kbd> {t.playSelectedTrack}</p><p><kbd>Shift</kbd> {t.computerSustain}</p></div>
      </aside>

      {modal && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className={`modal-card modal-${modal}`} role="dialog" aria-modal="true" aria-label={modal === "new-track" ? t.chooseInstrument : modal === "random-song" ? t.randomSongTitle : modal === "audio" ? t.audioRecordingSettings : modal === "shortcuts" ? t.keyCommands : modal === "export" ? t.takeYourMusic : modal === "sound-check" ? t.soundCheckTitle : t.sampleCredits}>
          <button className="modal-close" onClick={() => setModal(null)} aria-label={t.closePanel}>×</button>
          {modal === "new-track" && <>
            <div className="modal-title"><span>{t.addTrack.toUpperCase()}</span><h2>{t.chooseInstrument}</h2><p>{t.sharedKeyboardHelp}</p></div>
            <button className="suite-action" onClick={addChineseSuite}><span><b>{t.chineseSuite}</b><small>{t.chineseSuiteList}</small></span><strong>＋ {t.addEightTracks}</strong></button>
            <div className="instrument-grid">{INSTRUMENTS.map((instrument) => <button key={instrument.id} onClick={() => addTrack(instrument.id)}><i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrumentName(instrument, locale)}</strong><small>{instrumentFamily(instrument, locale)} · {t.sampleBadge.toUpperCase()}</small></span><b>＋</b></button>)}</div>
          </>}
          {modal === "random-song" && <>
            <div className="modal-title"><span>{t.randomSong.toUpperCase()}</span><h2>{t.randomSongTitle}</h2><p>{t.randomSongHelp}</p></div>
            <div className="random-song-field"><strong>{t.arrangementStyle}</strong><div className="random-style-grid">{RANDOM_STYLE_OPTIONS.map((option) => <button className={randomSongStyle === option.id ? "selected" : ""} aria-pressed={randomSongStyle === option.id} key={option.id} onClick={() => setRandomSongStyle(option.id)}><b>{locale === "zh" ? option.nameZh : option.nameEn}</b><small>{locale === "zh" ? option.detailZh : option.detailEn}</small></button>)}</div></div>
            <div className="random-section-config"><strong>{t.sectionCount}</strong><div>{[3, 4, 5, 6].map((count) => <button className={randomSongSectionCount === count ? "selected" : ""} aria-pressed={randomSongSectionCount === count} key={count} onClick={() => setRandomSongSectionCount(count)}>{count}</button>)}</div></div>
            <div className="random-section-outline">{SECTION_ROLES_BY_COUNT[randomSongSectionCount].map((role, index) => <span key={`${role}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b>{sectionRoleName(role, locale)}</span>)}</div>
            <p className="random-song-warning">{t.replaceArrangement}</p>
            <button className="primary-action random-song-submit" onClick={generateRandomSong}>✦ {t.generateArrangement}</button>
          </>}
          {modal === "audio" && <>
            <div className="modal-title"><span>{t.settings.toUpperCase()}</span><h2>{t.audioRecordingSettings}</h2><p>{t.lowLatencyHelp}</p></div>
            <div className="settings-list">
              <div><span><strong>{t.audioBuffer}</strong><small>{locale === "zh" ? "由浏览器和设备自动管理" : "Managed by the browser and device"}</small></span><b>{audioInfo ? `${audioInfo.latencyMs} ms` : "—"}</b></div>
              <div><span><strong>{t.sampleRate}</strong><small>{t.sampleRateHelp}</small></span><b>{audioInfo ? `${audioInfo.sampleRate / 1000} kHz` : "—"}</b></div>
              <div><span><strong>{locale === "zh" ? "重启音频引擎" : "Restart audio engine"}</strong><small>{locale === "zh" ? "用于设备切换或异常恢复" : "Use after a device change or audio fault"}</small></span><button onClick={() => { void restartAudioEngine(); }}>{locale === "zh" ? "重启" : "Restart"}</button></div>
              <div><span><strong>{t.recordingCountIn}</strong><small>{t.recordingCountInHelp}</small></span><input aria-label={t.recordingCountIn} type="checkbox" checked={countIn} onChange={(event) => setCountIn(event.target.checked)} /></div>
              <div><span><strong>{t.loopRecording}</strong><small>{t.loopRecordingHelp}</small></span><input aria-label={t.loopRecording} type="checkbox" checked={looping} onChange={(event) => commitProject((current) => ({ ...current, loop: { ...current.loop, enabled: event.target.checked } }))} /></div>
            </div>
            <button className="primary-action" onClick={() => setModal(null)}>{t.done}</button>
          </>}
          {modal === "shortcuts" && <>
            <div className="modal-title"><span>{t.keyCommands.toUpperCase()}</span><h2>{t.handsOnMusic}</h2><p>{t.keyboardMidiTogether}</p></div>
            <div className="shortcut-grid"><div><kbd>Space</kbd><span>{t.playPause}</span></div><div><kbd>R</kbd><span>{t.startStopRecording}</span></div><div><kbd>M</kbd><span>{t.metronome}</span></div><div><kbd>Shift</kbd><span>{t.sustainPedal}</span></div><div><kbd>A – K</kbd><span>{t.playCurrentSound}</span></div><div><kbd>⌘ Z</kbd><span>{t.undoEdit}</span></div><div><kbd>Delete</kbd><span>{t.deleteSelectedNote}</span></div><div><kbd>⌘ S</kbd><span>{t.saveLocally}</span></div></div>
          </>}
          {modal === "export" && <>
            <div className="modal-title"><span>{t.bounceShare.toUpperCase()}</span><h2>{t.takeYourMusic}</h2><p>{t.trackCount(tracks.length)} · {t.noteCount(tracks.reduce((count, track) => count + track.clips.reduce((sum, clip) => sum + clip.notes.length, 0), 0))} · {bpm} BPM</p></div>
            <div className="export-options"><button onClick={() => exportProject("midi")}><i>.MID</i><span><strong>{t.standardMidi}</strong><small>{t.midiCompatibility}</small></span><b>{t.download} ↗</b></button><button onClick={() => exportProject("json")}><i>.JSON</i><span><strong>{t.projectBundle}</strong><small>{t.projectBundleHelp}</small></span><b>{t.download} ↗</b></button></div>
            <p className="privacy-note">{t.privacyPromise}</p>
          </>}
          {modal === "samples" && <>
            <div className="modal-title"><span>{t.sampleCredits.toUpperCase()}</span><h2>{t.sampleSuiteTitle}</h2><p>{t.sampleCreditsHelp}</p></div>
            <div className="sample-credit-list"><div><i style={{ background: "#dd7f6f" }}>胡</i><span><strong>{instrumentName(instrumentById("erhu"), locale)}</strong><small>{t.erhuPerformance}</small></span><b>Berklee BISA<br />CC BY 4.0</b></div><div><i style={{ background: "#e7bd62" }}>采</i><span><strong>{t.remainingSeven}</strong><small>{t.soundfontMapping}</small></span><b>FluidR3 GM<br />CC BY 3.0</b></div></div>
            <div className="sample-links"><a href="https://remix.berklee.edu/bisa-chinese-erhu/" target="_blank" rel="noreferrer">{t.berkleeSource} ↗</a><a href="https://github.com/gleitz/midi-js-soundfonts" target="_blank" rel="noreferrer">{t.fluidSource} ↗</a></div><button className="primary-action" onClick={() => setModal(null)}>{t.done}</button>
          </>}
          {modal === "sound-check" && <>
            <div className="modal-title sound-check-title"><span>{t.soundCheck.toUpperCase()}</span><h2>{t.soundCheckTitle}</h2><p>{t.soundCheckHelp}</p></div>
            <div className="sound-check-summary">
              <div><strong>{soundCheckProgress}/{INSTRUMENTS.length}</strong><span>{soundCheckRunning ? t.checkingAll : `${INSTRUMENTS.filter((instrument) => statusFor(instrument.id) === "ready").length} ${t.ready.toUpperCase()}`}</span></div>
              <i><b style={{ width: `${soundCheckProgress / INSTRUMENTS.length * 100}%` }} /></i>
              <button onClick={() => void checkAllInstrumentSamples()} disabled={soundCheckRunning}>{soundCheckRunning ? t.checkingAll : t.checkAll}</button>
            </div>
            <div className="sound-check-list">
              {INSTRUMENTS.map((instrument) => {
                const status = statusFor(instrument.id);
                return <div className="sound-check-row" data-sound-check-id={instrument.id} data-sample-status={status} key={instrument.id}>
                  <i style={{ background: instrument.color }}>{instrument.icon}</i>
                  <span><strong>{instrumentName(instrument, locale)}</strong><small>{instrument.sample.asset} · {instrument.sample.license}</small></span>
                  <b className={`sample-state ${status}`}>{statusIcon(instrument.id)} {statusLabel(instrument.id)}</b>
                  <button onClick={() => auditionInstrument(instrument)} aria-label={`${t.previewSound} · ${instrumentName(instrument, locale)}`}>▶ {t.previewSound}</button>
                  {(status === "fallback" || status === "error") && <button className="retry-sample" onClick={() => retryInstrumentSample(instrument)}>↻ {t.retrySample}</button>}
                </div>;
              })}
            </div>
          </>}
        </section>
      </div>}

      {mobilePanel && <button className="mobile-scrim" onClick={closeMobilePanel} aria-label={t.closePanel} />}
      {toast && <div className="toast" role="status"><i />{toast}</div>}
    </main>
  );
}
