"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TARGET_DEVICE = "TupTup TS01-MIDI";
const PUBLIC_SITE_URL = "https://tuptup-midi-studio.bananapink.chatgpt.site";
const LOOP_STEPS = 32;
const KEYBOARD_LOW = 36;
const KEYBOARD_HIGH = 96;
const EDITOR_LOW = KEYBOARD_LOW;
const EDITOR_HIGH = KEYBOARD_HIGH;
const STORAGE_KEY = "tuptup-studio-project-v2";
const LOCALE_STORAGE_KEY = "tuptup-studio-locale";
const FLUID_SOUNDFONT_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";
const SAMPLE_ANCHOR_NOTES = [36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96];

const KEYBOARD_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
  g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

type ConnectionState = "idle" | "searching" | "connected" | "missing" | "blocked" | "error";
type Locale = "zh" | "en";
type DeviceMessageKind = "idle" | "searching" | "connected" | "missing" | "unsupported" | "failed";
type ModalName = "new-track" | "audio" | "shortcuts" | "export" | "samples" | null;
type InstrumentId = "grand" | "electric" | "pad" | "bass" | "lead" | "organ" | "marimba" | "strings" | "drums" | "guzheng" | "erhu" | "pipa" | "dizi" | "yangqin" | "suona" | "sheng" | "chinesePercussion";

type SampleSpec = {
  kind: "soundfont" | "audio";
  asset: string;
  rootNote?: number;
  source: string;
  license: string;
};

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
  sample?: SampleSpec;
};

const UI_TEXT = {
  zh: {
    project: "工程", projectName: "工程名称", projectActions: "工程操作", newProject: "新建", importMidi: "导入 MIDI", save: "保存", export: "导出", midiOnline: "MIDI 在线", connectDevice: "连接设备",
    language: "语言", switchLanguage: "切换到 English", guide: "说明书", openGuide: "打开功能说明书", transport: "传输控制", openLibrary: "打开音色库", undo: "撤销", redo: "重做", metronome: "节拍器", tempo: "速度", countIn: "预备拍", returnStart: "回到开头", pause: "暂停", play: "播放", stopRecording: "停止录音", record: "录音", loop: "循环", master: "主音量", audioSettings: "音频设置", openMixer: "打开混音器",
    browser: "浏览器", libraryTitle: "音色库", tones: "音色", samples: "采样", effects: "效果", sampleLibraryManaged: "采样库可在工程包中管理", effectsInChannel: "效果器位于右侧通道条", studioCollection: "录音室", chineseCollection: "国风采样", credits: "来源", fullSuite: "整套", tracks: "音轨", ready: "已就绪", loading: "加载中", synthFallback: "合成回退", loadOnDemand: "按需加载",
    arrangement: "编曲", arrangementTitle: "编曲时间线", selectTool: "选择工具", pencilTool: "铅笔工具", splitTool: "切割工具", grid: "网格", gridAccuracy: "网格精度", add: "添加", addInstrumentTrack: "添加乐器音轨", notes: "音符",
    pianoRoll: "钢琴卷帘", quantize: "量化 1/16", humanize: "人性化", duplicate: "重复", delete: "删除", rollHelp: "钢琴卷帘，点击空白处添加音符", stepLabel: (step: number) => `第 ${step} 格`, stepInput: "步进输入", stepInputHint: "开启后，按下方键盘、电脑 A–K 或 MIDI 键盘，音符会写入播放头并自动前进", liveRecordHint: "实时演奏请先待录音轨，再按 R 或录音键", learnMore: "查看完整说明",
    liveInput: "实时输入", note: "音符", velocity: "力度", octave: "八度", sustain: "延音", sampleReady: "采样就绪", playToLoad: "演奏以加载", computerKeys: "电脑键 A–K", keyboardLabel: "共享 61 键演奏键盘",
    channelStrip: "通道条", trackMixer: "音轨混音", selectedTrack: "已选音轨", trackName: "音轨名称", instrument: "乐器", inserts: "插入效果", compressor: "压缩器", eq: "三段均衡", on: "开", emptySlot: "空插槽", emptySlotReady: "空插槽已就绪", sends: "发送", reverb: "混响", delay: "延迟", pan: "声像", mute: "静音", solo: "独奏", arm: "待录", deleteTrack: "删除当前音轨",
    audioEngine: "音频引擎", polyphony: "复音数", autosave: "自动保存 · 本机", hardware: "硬件", midiDevice: "MIDI 设备", connected: "已连接", readyToConnect: "等待连接", searchingDevices: "正在搜索设备…", rescanMidi: "重新扫描 MIDI 输入", connectMidiKeyboard: "连接 MIDI 键盘", inputMode: "输入模式", allChannels: "全通道", latency: "延迟", interactive: "交互级", dataPrivacy: "数据隐私", localOnly: "仅限本机",
    deviceIdle: "尚未连接硬件；电脑键盘可直接演奏", deviceSearching: "正在请求 MIDI 设备权限…", deviceMissing: "未发现 MIDI 输入，请检查 USB 连接", deviceUnsupported: "当前浏览器不支持 Web MIDI，请使用桌面版 Chrome 或 Edge", deviceFailed: "连接失败；请允许 MIDI 权限后重试", devicePorts: (count: number) => `${count} 个输入端口在线 · 通道全开`,
    desktopBrowserRequired: "需要桌面版 Chrome 或 Edge", usbPreviewWarning: "内置预览可能无法访问 USB。请在受支持的浏览器打开正式站点并允许 MIDI 权限。", copySiteLink: "复制站点链接", siteLinkCopied: "站点链接已复制", controllerMap: "控制器映射", sustainPedal: "延音踏板", playSelectedTrack: "演奏当前音轨", computerSustain: "电脑键盘延音",
    addTrack: "添加音轨", chooseInstrument: "选择你的下一件乐器", sharedKeyboardHelp: "所有音轨共享下方键盘，国风乐器会在首次选择时加载公开采样。", chineseSuite: "国风采样套组", chineseSuiteList: "古筝 · 二胡 · 琵琶 · 竹笛 · 扬琴 · 唢呐 · 笙 · 锣鼓", addEightTracks: "加入 8 条音轨", sampleBadge: "采样",
    settings: "设置", audioRecordingSettings: "音频与录音设置", lowLatencyHelp: "为浏览器内的低延迟演奏优化。", audioBuffer: "音频缓冲", bufferHelp: "延迟越低，CPU 占用越高", sampleRate: "采样率", sampleRateHelp: "当前音频上下文", recordingCountIn: "录音预备拍", recordingCountInHelp: "录音前播放一小节节拍", loopRecording: "循环录音", loopRecordingHelp: "持续覆盖 2 小节循环区域", done: "完成",
    keyCommands: "快捷键", handsOnMusic: "把双手留给音乐", keyboardMidiTogether: "电脑键盘与 MIDI 键盘可同时使用。", playPause: "播放 / 暂停", startStopRecording: "开始 / 停止录音", playCurrentSound: "演奏当前音色", undoEdit: "撤销编辑", deleteSelectedNote: "删除选中音符", saveLocally: "保存到本机",
    bounceShare: "导出与分享", takeYourMusic: "带走你的作品", trackCount: (count: number) => `${count} 条音轨`, noteCount: (count: number) => `${count} 个音符`, standardMidi: "标准 MIDI 文件", midiCompatibility: "兼容 Logic、Ableton、Cubase 与大多数硬件", projectBundle: "TupTup 工程包", projectBundleHelp: "保留音色、混音、速度和所有音轨数据", download: "下载", privacyPromise: "所有演奏与导出均在此设备完成，不会上传音乐数据。",
    sampleCredits: "采样鸣谢", sampleSuiteTitle: "国风采样套组", sampleCreditsHelp: "按需从公开音源加载；下载后缓存在当前浏览器会话。无法联网时自动使用内置合成音色。", erhuPerformance: "真实二胡 Regular Vibrato A4 · 演奏 Yu Chun Chan", remainingSeven: "其余七件乐器", soundfontMapping: "FluidR3 GM 多采样映射 · Koto / Shamisen / Flute / Dulcimer / Shanai / Reed Organ / Taiko", berkleeSource: "Berklee 二胡采样来源", fluidSource: "FluidR3 SoundFont 来源", closePanel: "关闭面板",
    brandToast: "TupTup Studio · 浏览器 MIDI 工作站", sampleLoaded: (name: string) => `${name} 采样已就绪`, sampleFailed: (name: string) => `${name} 加载失败，已使用合成音色`, countInRecording: "预备拍开启 · 开始录音", recordingStarted: "录音已开始", recordingStopped: "录音已停止", midiConnected: "MIDI 键盘已连接", trackCreated: (name: string) => `${name} 音轨已创建`, suiteAdded: "国风采样套组已加入 · 8 条音轨", trackDeleted: "音轨已删除 · 可撤销", projectCreated: "新工程已创建", projectSaved: "工程已保存到此设备", midiExported: "MIDI 已导出", bundleExported: "工程包已导出", midiImported: (count: number) => `已导入 ${count} 条 MIDI 音轨`, midiImportFailed: "无法读取此 MIDI 文件",
  },
  en: {
    project: "Project", projectName: "Project name", projectActions: "Project actions", newProject: "New", importMidi: "Import MIDI", save: "Save", export: "Export", midiOnline: "MIDI Online", connectDevice: "Connect Device",
    language: "Language", switchLanguage: "切换到中文", guide: "Guide", openGuide: "Open the feature guide", transport: "Transport controls", openLibrary: "Open sound library", undo: "Undo", redo: "Redo", metronome: "Metronome", tempo: "Tempo", countIn: "Count-in", returnStart: "Return to start", pause: "Pause", play: "Play", stopRecording: "Stop recording", record: "Record", loop: "Loop", master: "Master", audioSettings: "Audio settings", openMixer: "Open mixer",
    browser: "Browser", libraryTitle: "Sound Library", tones: "Sounds", samples: "Samples", effects: "Effects", sampleLibraryManaged: "Manage the sample library in the project bundle", effectsInChannel: "Effects are available in the channel strip", studioCollection: "Studio", chineseCollection: "Chinese Samples", credits: "Credits", fullSuite: "Full Suite", tracks: "Tracks", ready: "Ready", loading: "Loading", synthFallback: "Synth Fallback", loadOnDemand: "Load on Demand",
    arrangement: "Arrangement", arrangementTitle: "Arrangement Timeline", selectTool: "Select tool", pencilTool: "Pencil tool", splitTool: "Split tool", grid: "Grid", gridAccuracy: "Grid resolution", add: "Add", addInstrumentTrack: "Add Instrument Track", notes: "Notes",
    pianoRoll: "Piano Roll", quantize: "Quantize 1/16", humanize: "Humanize", duplicate: "Duplicate", delete: "Delete", rollHelp: "Piano roll; click empty space to add a note", stepLabel: (step: number) => `step ${step}`, stepInput: "Step Input", stepInputHint: "Turn it on, then play the keyboard below, A–K, or a MIDI keyboard. Notes land at the playhead and advance automatically.", liveRecordHint: "For live performance, arm a track and press R or Record", learnMore: "View Full Guide",
    liveInput: "Live Input", note: "Note", velocity: "Velocity", octave: "Octave", sustain: "Sustain", sampleReady: "Sample Ready", playToLoad: "Play to Load", computerKeys: "Computer Keys A–K", keyboardLabel: "Shared 61-key performance keyboard",
    channelStrip: "Channel Strip", trackMixer: "Track Mixer", selectedTrack: "Selected Track", trackName: "Track name", instrument: "Instrument", inserts: "Inserts", compressor: "Compressor", eq: "3-Band EQ", on: "On", emptySlot: "Empty Slot", emptySlotReady: "Empty slot is ready", sends: "Sends", reverb: "Reverb", delay: "Delay", pan: "Pan", mute: "Mute", solo: "Solo", arm: "Arm", deleteTrack: "Delete Current Track",
    audioEngine: "Audio Engine", polyphony: "Polyphony", autosave: "Autosave · Local", hardware: "Hardware", midiDevice: "MIDI Device", connected: "Connected", readyToConnect: "Ready to Connect", searchingDevices: "Searching for devices…", rescanMidi: "Rescan MIDI Inputs", connectMidiKeyboard: "Connect MIDI Keyboard", inputMode: "Input Mode", allChannels: "Omni · All Channels", latency: "Latency", interactive: "Interactive", dataPrivacy: "Data Privacy", localOnly: "Local Only",
    deviceIdle: "No hardware connected; use the computer keyboard to play", deviceSearching: "Requesting MIDI device permission…", deviceMissing: "No MIDI input found; check the USB connection", deviceUnsupported: "Web MIDI is not supported here; use desktop Chrome or Edge", deviceFailed: "Connection failed; allow MIDI access and try again", devicePorts: (count: number) => `${count} input ${count === 1 ? "port" : "ports"} online · all channels`,
    desktopBrowserRequired: "Desktop Chrome or Edge Required", usbPreviewWarning: "The embedded preview may not access USB. Open the live site in a supported browser and allow MIDI permission.", copySiteLink: "Copy Site Link", siteLinkCopied: "Site link copied", controllerMap: "Controller Map", sustainPedal: "Sustain pedal", playSelectedTrack: "Play selected track", computerSustain: "Computer sustain",
    addTrack: "Add Track", chooseInstrument: "Choose Your Next Instrument", sharedKeyboardHelp: "Every track shares the keyboard below. Chinese instruments load public samples the first time you select them.", chineseSuite: "Chinese Sample Suite", chineseSuiteList: "Guzheng · Erhu · Pipa · Dizi · Yangqin · Suona · Sheng · Percussion", addEightTracks: "Add 8 Tracks", sampleBadge: "Sample",
    settings: "Settings", audioRecordingSettings: "Audio & Recording Settings", lowLatencyHelp: "Optimized for low-latency performance in the browser.", audioBuffer: "Audio Buffer", bufferHelp: "Lower latency uses more CPU", sampleRate: "Sample Rate", sampleRateHelp: "Current audio context", recordingCountIn: "Recording Count-in", recordingCountInHelp: "Play one bar before recording", loopRecording: "Loop Recording", loopRecordingHelp: "Continuously overdub the two-bar loop", done: "Done",
    keyCommands: "Key Commands", handsOnMusic: "Keep Your Hands on the Music", keyboardMidiTogether: "Use the computer keyboard and a MIDI keyboard together.", playPause: "Play / Pause", startStopRecording: "Start / Stop Recording", playCurrentSound: "Play Current Sound", undoEdit: "Undo Edit", deleteSelectedNote: "Delete Selected Note", saveLocally: "Save Locally",
    bounceShare: "Bounce & Share", takeYourMusic: "Take Your Music With You", trackCount: (count: number) => `${count} ${count === 1 ? "track" : "tracks"}`, noteCount: (count: number) => `${count} ${count === 1 ? "note" : "notes"}`, standardMidi: "Standard MIDI File", midiCompatibility: "Works with Logic, Ableton, Cubase and most hardware", projectBundle: "TupTup Project Bundle", projectBundleHelp: "Preserves sounds, mix, tempo and every track", download: "Download", privacyPromise: "Performance and export stay on this device. No music data is uploaded.",
    sampleCredits: "Sample Credits", sampleSuiteTitle: "Chinese Sample Suite", sampleCreditsHelp: "Public sound sources load on demand and stay cached for this browser session. Built-in synthesis takes over when offline.", erhuPerformance: "Real Erhu Regular Vibrato A4 · performed by Yu Chun Chan", remainingSeven: "Seven More Instruments", soundfontMapping: "FluidR3 GM multisample mappings · Koto / Shamisen / Flute / Dulcimer / Shanai / Reed Organ / Taiko", berkleeSource: "Berklee Erhu Sample Source", fluidSource: "FluidR3 SoundFont Source", closePanel: "Close panel",
    brandToast: "TupTup Studio · Browser MIDI Workstation", sampleLoaded: (name: string) => `${name} sample is ready`, sampleFailed: (name: string) => `${name} failed to load; using the synth fallback`, countInRecording: "Count-in enabled · recording started", recordingStarted: "Recording started", recordingStopped: "Recording stopped", midiConnected: "MIDI keyboard connected", trackCreated: (name: string) => `${name} track created`, suiteAdded: "Chinese sample suite added · 8 tracks", trackDeleted: "Track deleted · undo available", projectCreated: "New project created", projectSaved: "Project saved on this device", midiExported: "MIDI exported", bundleExported: "Project bundle exported", midiImported: (count: number) => `Imported ${count} MIDI ${count === 1 ? "track" : "tracks"}`, midiImportFailed: "This MIDI file could not be read",
  },
} as const;

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
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  release: number;
};

type SampleAnchor = {
  note: number;
  buffer: AudioBuffer;
};

const INSTRUMENTS: Instrument[] = [
  { id: "grand", name: "Studio Grand", family: "钢琴", nameZh: "录音室大钢琴", nameEn: "Studio Grand", familyZh: "钢琴", familyEn: "Piano", icon: "♩", color: "#9df564", wave: "triangle", overtone: "sine", attack: .008, release: .7, cutoff: 5200, program: 0 },
  { id: "electric", name: "Velvet Keys", family: "电钢", nameZh: "丝绒电钢", nameEn: "Velvet Keys", familyZh: "电钢", familyEn: "Electric Piano", icon: "⌁", color: "#63d7ff", wave: "sine", overtone: "triangle", attack: .012, release: .9, cutoff: 4200, program: 4 },
  { id: "pad", name: "Aurora Pad", family: "合成器", nameZh: "极光铺底", nameEn: "Aurora Pad", familyZh: "合成器", familyEn: "Synthesizer", icon: "≈", color: "#b69cff", wave: "sawtooth", overtone: "triangle", attack: .32, release: 1.5, cutoff: 1700, program: 89 },
  { id: "bass", name: "Deep Mono", family: "贝斯", nameZh: "深潜单声道", nameEn: "Deep Mono", familyZh: "贝斯", familyEn: "Bass", icon: "≋", color: "#ffbb55", wave: "square", overtone: "sawtooth", attack: .01, release: .35, cutoff: 1100, program: 38 },
  { id: "lead", name: "Neon Lead", family: "合成器", nameZh: "霓虹主音", nameEn: "Neon Lead", familyZh: "合成器", familyEn: "Synthesizer", icon: "⌁", color: "#ff6c8f", wave: "sawtooth", overtone: "square", attack: .018, release: .28, cutoff: 3600, program: 81 },
  { id: "organ", name: "Moon Organ", family: "风琴", nameZh: "月光风琴", nameEn: "Moon Organ", familyZh: "风琴", familyEn: "Organ", icon: "Ⅱ", color: "#f5e663", wave: "sine", overtone: "square", attack: .02, release: .5, cutoff: 4800, program: 16 },
  { id: "marimba", name: "Glass Marimba", family: "打击乐", nameZh: "玻璃马林巴", nameEn: "Glass Marimba", familyZh: "打击乐", familyEn: "Percussion", icon: "◇", color: "#57e0ba", wave: "sine", overtone: "sine", attack: .004, release: .42, cutoff: 7000, program: 12 },
  { id: "strings", name: "Warm Ensemble", family: "弦乐", nameZh: "温暖弦乐群", nameEn: "Warm Ensemble", familyZh: "弦乐", familyEn: "Strings", icon: "〰", color: "#ef9dff", wave: "sawtooth", overtone: "triangle", attack: .16, release: 1.2, cutoff: 2300, program: 48 },
  { id: "drums", name: "Pulse Kit", family: "鼓组", nameZh: "脉冲鼓组", nameEn: "Pulse Kit", familyZh: "鼓组", familyEn: "Drum Kit", icon: "●", color: "#ff7a52", wave: "square", overtone: "sine", attack: .002, release: .2, cutoff: 6200, program: 0 },
  { id: "guzheng", name: "流光古筝", family: "国风 · 弹拨", nameZh: "流光古筝", nameEn: "Luminous Guzheng", familyZh: "国风 · 弹拨", familyEn: "Chinese · Plucked", icon: "筝", color: "#e7bd62", wave: "triangle", overtone: "sine", attack: .004, release: 1.1, cutoff: 6800, program: 107, collection: "chinese", sample: { kind: "soundfont", asset: "koto", source: "FluidR3 GM", license: "CC BY 3.0" } },
  { id: "erhu", name: "烟雨二胡", family: "国风 · 拉弦", nameZh: "烟雨二胡", nameEn: "Mist Erhu", familyZh: "国风 · 拉弦", familyEn: "Chinese · Bowed", icon: "胡", color: "#dd7f6f", wave: "sawtooth", overtone: "triangle", attack: .035, release: .7, cutoff: 3900, program: 110, collection: "chinese", sample: { kind: "audio", asset: "/samples/chinese/erhu-vibrato-a4.wav", rootNote: 69, source: "Berklee BISA", license: "CC BY 4.0" } },
  { id: "pipa", name: "飞花琵琶", family: "国风 · 弹拨", nameZh: "飞花琵琶", nameEn: "Blooming Pipa", familyZh: "国风 · 弹拨", familyEn: "Chinese · Plucked", icon: "琵", color: "#f29b63", wave: "triangle", overtone: "square", attack: .003, release: .65, cutoff: 6200, program: 106, collection: "chinese", sample: { kind: "soundfont", asset: "shamisen", source: "FluidR3 GM", license: "CC BY 3.0" } },
  { id: "dizi", name: "清风竹笛", family: "国风 · 吹管", nameZh: "清风竹笛", nameEn: "Bamboo Dizi", familyZh: "国风 · 吹管", familyEn: "Chinese · Wind", icon: "笛", color: "#64d9ad", wave: "sine", overtone: "triangle", attack: .035, release: .52, cutoff: 7200, program: 73, collection: "chinese", sample: { kind: "soundfont", asset: "flute", source: "FluidR3 GM", license: "CC BY 3.0" } },
  { id: "yangqin", name: "星河扬琴", family: "国风 · 击弦", nameZh: "星河扬琴", nameEn: "Starlight Yangqin", familyZh: "国风 · 击弦", familyEn: "Chinese · Hammered", icon: "扬", color: "#7fc5ef", wave: "triangle", overtone: "sine", attack: .003, release: .9, cutoff: 7500, program: 15, collection: "chinese", sample: { kind: "soundfont", asset: "dulcimer", source: "FluidR3 GM", license: "CC BY 3.0" } },
  { id: "suona", name: "赤焰唢呐", family: "国风 · 双簧", nameZh: "赤焰唢呐", nameEn: "Blazing Suona", familyZh: "国风 · 双簧", familyEn: "Chinese · Double Reed", icon: "呐", color: "#ff646c", wave: "sawtooth", overtone: "square", attack: .016, release: .35, cutoff: 5600, program: 111, collection: "chinese", sample: { kind: "soundfont", asset: "shanai", source: "FluidR3 GM", license: "CC BY 3.0" } },
  { id: "sheng", name: "云岫笙", family: "国风 · 簧管", nameZh: "云岫笙", nameEn: "Cloud Sheng", familyZh: "国风 · 簧管", familyEn: "Chinese · Free Reed", icon: "笙", color: "#b7a0ff", wave: "sine", overtone: "square", attack: .028, release: .65, cutoff: 5100, program: 20, collection: "chinese", sample: { kind: "soundfont", asset: "reed_organ", source: "FluidR3 GM", license: "CC BY 3.0" } },
  { id: "chinesePercussion", name: "醒狮锣鼓", family: "国风 · 打击乐", nameZh: "醒狮锣鼓", nameEn: "Lion Dance Percussion", familyZh: "国风 · 打击乐", familyEn: "Chinese · Percussion", icon: "鼓", color: "#ffcc4f", wave: "square", overtone: "sine", attack: .002, release: .32, cutoff: 6600, program: 116, collection: "chinese", sample: { kind: "soundfont", asset: "taiko_drum", source: "FluidR3 GM", license: "CC BY 3.0" } },
];

const CORE_INSTRUMENTS = INSTRUMENTS.filter((instrument) => instrument.collection !== "chinese");
const CHINESE_INSTRUMENTS = INSTRUMENTS.filter((instrument) => instrument.collection === "chinese");

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

function soundfontKeyToMidi(key: string) {
  const match = /^([A-G])([b#]?)(-?\d+)$/.exec(key);
  if (!match) return null;
  const naturalNotes: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const natural = naturalNotes[match[1]];
  const accidental = match[2] === "b" ? -1 : match[2] === "#" ? 1 : 0;
  return (Number(match[3]) + 1) * 12 + natural + accidental;
}

function decodeDataUrl(dataUrl: string) {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
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
    const channel = track.instrument === "drums" || track.instrument === "chinesePercussion" ? 9 : trackIndex % 9;
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
  const [locale, setLocale] = useState<Locale>("zh");
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
  const [sampleStatus, setSampleStatus] = useState<Partial<Record<InstrumentId, "loading" | "ready" | "error">>>({});
  const [sustain, setSustainState] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [deviceDrawer, setDeviceDrawer] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"library" | "mixer" | null>(null);
  const [toast, setToast] = useState("");
  const [projectName, setProjectName] = useState("MIDNIGHT SKETCH");

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const voicesRef = useRef(new Map<string, Voice>());
  const sampleAnchorsRef = useRef(new Map<InstrumentId, SampleAnchor[]>());
  const samplePromisesRef = useRef(new Map<InstrumentId, Promise<SampleAnchor[]>>());
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
  const stepInputRef = useRef(stepInput);
  const stepChordStartRef = useRef<number | null>(null);
  const recordStartsRef = useRef(new Map<number, { step: number; trackId: string }>());
  const toastTimerRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const t = UI_TEXT[locale];
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
  const deviceMessage = deviceMessageKind === "searching" ? t.deviceSearching
    : deviceMessageKind === "connected" ? t.devicePorts(devicePortCount)
      : deviceMessageKind === "missing" ? t.deviceMissing
        : deviceMessageKind === "unsupported" ? t.deviceUnsupported
          : deviceMessageKind === "failed" ? t.deviceFailed
            : t.deviceIdle;

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

  const loadSampleInstrument = useCallback((preset: Instrument, announce = true) => {
    const sample = preset.sample;
    if (!sample) return Promise.resolve([] as SampleAnchor[]);
    const cached = sampleAnchorsRef.current.get(preset.id);
    if (cached) return Promise.resolve(cached);
    const pending = samplePromisesRef.current.get(preset.id);
    if (pending) return pending;

    setSampleStatus((status) => ({ ...status, [preset.id]: "loading" }));
    const promise = (async () => {
      try {
        const context = ensureAudio();
        let anchors: SampleAnchor[];
        if (sample.kind === "audio") {
          const response = await fetch(sample.asset);
          if (!response.ok) throw new Error("Sample request failed");
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          anchors = [{ note: sample.rootNote ?? 69, buffer }];
        } else {
          const response = await fetch(`${FLUID_SOUNDFONT_BASE}/${sample.asset}-mp3.js`);
          if (!response.ok) throw new Error("SoundFont request failed");
          const javascript = await response.text();
          const objectStart = javascript.indexOf("{", javascript.indexOf("="));
          const objectEnd = javascript.lastIndexOf("}");
          if (objectStart < 0 || objectEnd <= objectStart) throw new Error("Invalid SoundFont data");
          const samples = JSON.parse(javascript.slice(objectStart, objectEnd + 1)) as Record<string, string>;
          const available = Object.entries(samples).map(([key, data]) => ({ note: soundfontKeyToMidi(key), data })).filter((item): item is { note: number; data: string } => item.note !== null);
          const chosen = new Map<number, string>();
          SAMPLE_ANCHOR_NOTES.forEach((target) => {
            const nearest = available.reduce((best, item) => Math.abs(item.note - target) < Math.abs(best.note - target) ? item : best, available[0]);
            if (nearest) chosen.set(nearest.note, nearest.data);
          });
          anchors = await Promise.all(Array.from(chosen, async ([note, data]) => ({ note, buffer: await context.decodeAudioData(decodeDataUrl(data)) })));
        }
        sampleAnchorsRef.current.set(preset.id, anchors);
        setSampleStatus((status) => ({ ...status, [preset.id]: "ready" }));
        if (announce) notify(t.sampleLoaded(instrumentName(preset, locale)));
        return anchors;
      } catch {
        setSampleStatus((status) => ({ ...status, [preset.id]: "error" }));
        if (announce) notify(t.sampleFailed(instrumentName(preset, locale)));
        return [];
      } finally {
        samplePromisesRef.current.delete(preset.id);
      }
    })();
    samplePromisesRef.current.set(preset.id, promise);
    return promise;
  }, [ensureAudio, locale, notify, t]);

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

  const triggerNote = useCallback((note: number, velocity = 96, trackId = selectedTrackId, source: "live" | "sequence" = "live", durationSeconds?: number) => {
    const track = tracksRef.current.find((item) => item.id === trackId) ?? tracksRef.current[0];
    if (!track || track.mute || (tracksRef.current.some((item) => item.solo) && !track.solo)) return "";
    const context = ensureAudio();
    const master = masterGainRef.current;
    if (!master) return "";
    if (source === "live") {
      const prior = liveVoiceKeysRef.current.get(note);
      if (prior) {
        stopVoice(prior, true);
        heldNotesRef.current.delete(note);
      }
    }
    const preset = instrumentById(track.instrument);
    const key = `${source}-${trackId}-${note}-${context.currentTime}-${Math.random()}`;
    const now = context.currentTime;
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
        recordStartsRef.current.set(note, { step: currentStepRef.current, trackId });
        return;
      }
      if (!stepInputRef.current) return;
      const start = joinsHeldChord && stepChordStartRef.current !== null ? stepChordStartRef.current : currentStepRef.current;
      const event: NoteEvent = { id: uid("step"), note, start, duration: 1, velocity };
      commitTracks((current) => current.map((item) => item.id === trackId ? { ...item, notes: [...item.notes, event] } : item));
      setSelectedNoteId(event.id);
      if (joinsHeldChord) return;
      stepChordStartRef.current = start;
      const nextStep = (start + 1) % LOOP_STEPS;
      currentStepRef.current = nextStep;
      setCurrentStep(nextStep);
    };

    if (preset.sample && sampleAnchors?.length) {
      const anchor = sampleAnchors.reduce((best, item) => Math.abs(item.note - note) < Math.abs(best.note - note) ? item : best, sampleAnchors[0]);
      const sampleSource = context.createBufferSource();
      sampleSource.buffer = anchor.buffer;
      sampleSource.playbackRate.value = 2 ** ((note - anchor.note) / 12);
      panner.pan.value = track.pan / 100;
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.38 * strength * track.volume / 100, now + Math.max(.003, preset.attack));
      sampleSource.connect(gain).connect(panner).connect(master);
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
        window.setTimeout(() => stopVoice(key), durationSeconds * 1000);
      }
      return key;
    }

    if (preset.sample && sampleStatus[preset.id] !== "error") void loadSampleInstrument(preset, false);
    const filter = context.createBiquadFilter();
    const oscillators = [context.createOscillator(), context.createOscillator()];
    const isPercussion = preset.id === "drums" || preset.id === "chinesePercussion";
    const baseFrequency = isPercussion ? (note === 36 ? 74 : note === 38 ? 185 : 430) : noteFrequency(note);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(preset.cutoff * (.62 + strength * .52), now);
    filter.Q.value = preset.id === "bass" ? 4.2 : .8;
    panner.pan.value = track.pan / 100;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime((preset.id === "pad" ? .06 : .11) * strength * track.volume / 100, now + preset.attack);
    gain.gain.exponentialRampToValueAtTime((isPercussion ? .0002 : .045) * strength * track.volume / 100, now + (isPercussion ? .16 : Math.max(.28, preset.attack + .4)));
    oscillators[0].type = preset.wave;
    oscillators[0].frequency.setValueAtTime(baseFrequency, now);
    oscillators[1].type = preset.overtone;
    oscillators[1].frequency.setValueAtTime(baseFrequency * (preset.id === "organ" ? 2 : isPercussion ? 1.65 : 2), now);
    oscillators[1].detune.value = preset.id === "pad" || preset.id === "strings" ? 9 : 2;
    const overtoneGain = context.createGain();
    overtoneGain.gain.value = preset.id === "organ" ? .42 : preset.id === "marimba" ? .34 : .17;
    oscillators[0].connect(filter);
    oscillators[1].connect(overtoneGain).connect(filter);
    filter.connect(gain).connect(panner).connect(master);
    oscillators.forEach((oscillator) => oscillator.start(now));
    voicesRef.current.set(key, { sources: oscillators, gain, release: preset.release });
    setVoiceCount(voicesRef.current.size);
    if (source === "live") {
      captureLivePerformance();
    } else if (durationSeconds) {
      window.setTimeout(() => stopVoice(key), durationSeconds * 1000);
    }
    return key;
  }, [commitTracks, ensureAudio, loadSampleInstrument, sampleStatus, selectedTrackId, stopVoice]);

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
      notify(next ? (countIn ? t.countInRecording : t.recordingStarted) : t.recordingStopped);
      return next;
    });
  }, [countIn, ensureAudio, notify, t]);

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
      midiAccessRef.current = access;
      const attachInputs = async () => {
        midiInputsRef.current.forEach((input) => { input.onmidimessage = null; });
        const inputs = Array.from(access.inputs.values());
        if (!inputs.length) {
          midiInputsRef.current.clear();
          setConnection("missing");
          setDeviceMessageKind("missing");
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
        setDevicePortCount(opened.length);
        setDeviceMessageKind("connected");
        ensureAudio();
        notify(t.midiConnected);
      };
      await attachInputs();
      access.onstatechange = () => { void attachInputs(); };
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : "";
      setConnection(errorName === "NotAllowedError" || errorName === "SecurityError" ? "blocked" : "error");
      setDeviceMessageKind("failed");
    }
  }, [ensureAudio, notify, releaseLiveNote, setSustain, t, triggerNote]);

  const addTrack = useCallback((instrumentId: InstrumentId) => {
    const instrument = instrumentById(instrumentId);
    const localizedName = instrumentName(instrument, locale);
    const track: Track = { id: uid("track"), name: locale === "en" ? localizedName.toUpperCase() : localizedName, instrument: instrument.id, color: instrument.color, volume: 76, pan: 0, reverb: 18, mute: false, solo: false, arm: true, notes: [] };
    commitTracks((current) => [...current.map((item) => ({ ...item, arm: false })), track]);
    setSelectedTrackId(track.id);
    setSelectedNoteId(null);
    setModal(null);
    if (instrument.sample) void loadSampleInstrument(instrument);
    notify(t.trackCreated(localizedName));
  }, [commitTracks, loadSampleInstrument, locale, notify, t]);

  const addChineseSuite = useCallback(() => {
    const suite = CHINESE_INSTRUMENTS.map((instrument, index): Track => ({
      id: uid("track"), name: locale === "en" ? instrument.nameEn.toUpperCase() : instrument.nameZh, instrument: instrument.id, color: instrument.color,
      volume: instrument.id === "suona" ? 62 : 76, pan: index % 2 === 0 ? -12 : 12, reverb: instrument.id === "erhu" || instrument.id === "dizi" ? 34 : 20,
      mute: false, solo: false, arm: index === 0, notes: [],
    }));
    commitTracks((current) => [...current.map((track) => ({ ...track, arm: false })), ...suite]);
    setSelectedTrackId(suite[0].id);
    setSelectedNoteId(null);
    setModal(null);
    void loadSampleInstrument(CHINESE_INSTRUMENTS[0]);
    notify(t.suiteAdded);
  }, [commitTracks, loadSampleInstrument, locale, notify, t]);

  const updateTrack = useCallback((trackId: string, patch: Partial<Track>, withHistory = false) => {
    const update = (current: Track[]) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track);
    if (withHistory) commitTracks(update); else setTracks(update);
  }, [commitTracks]);

  const setArmedTrack = useCallback((trackId: string) => {
    setTracks((current) => current.map((track) => ({ ...track, arm: track.id === trackId ? !track.arm : false })));
    setSelectedTrackId(trackId);
    const preset = instrumentById(tracksRef.current.find((track) => track.id === trackId)?.instrument ?? "grand");
    if (preset.sample) void loadSampleInstrument(preset);
  }, [loadSampleInstrument]);

  const deleteSelectedTrack = useCallback(() => {
    if (tracks.length <= 1 || !selectedTrack) return;
    const index = tracks.findIndex((track) => track.id === selectedTrack.id);
    const fallback = tracks[Math.max(0, index - 1)];
    commitTracks((current) => current.filter((track) => track.id !== selectedTrack.id));
    setSelectedTrackId(fallback.id);
    setSelectedNoteId(null);
    notify(t.trackDeleted);
  }, [commitTracks, notify, selectedTrack, t, tracks]);

  const changeInstrument = useCallback((instrumentId: InstrumentId) => {
    const instrument = instrumentById(instrumentId);
    const localizedName = instrumentName(instrument, locale);
    updateTrack(selectedTrackId, { instrument: instrumentId, color: instrument.color, name: locale === "en" ? localizedName.toUpperCase() : localizedName }, true);
    if (instrument.sample) void loadSampleInstrument(instrument);
  }, [loadSampleInstrument, locale, selectedTrackId, updateTrack]);

  const selectTrack = useCallback((track: Track) => {
    setSelectedTrackId(track.id);
    setSelectedNoteId(null);
    const preset = instrumentById(track.instrument);
    if (preset.sample) void loadSampleInstrument(preset);
  }, [loadSampleInstrument]);

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
    notify(t.projectCreated);
  }, [notify, stopTransport, t]);

  const saveProject = useCallback(() => {
    const project = { version: 2, name: projectName, bpm, masterVolume, tracks };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    notify(t.projectSaved);
  }, [bpm, masterVolume, notify, projectName, t, tracks]);

  const exportProject = useCallback((type: "midi" | "json") => {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tuptup-session";
    if (type === "midi") downloadBlob(new Blob([makeMidi(tracks, bpm)], { type: "audio/midi" }), `${safeName}.mid`);
    else downloadBlob(new Blob([JSON.stringify({ version: 2, name: projectName, bpm, masterVolume, tracks }, null, 2)], { type: "application/json" }), `${safeName}.tuptup.json`);
    notify(type === "midi" ? t.midiExported : t.bundleExported);
    setModal(null);
  }, [bpm, masterVolume, notify, projectName, t, tracks]);

  const importMidi = useCallback(async (file: File) => {
    try {
      const parsed = parseMidi(await file.arrayBuffer());
      stopTransport();
      setHistory((items) => [...items.slice(-29), cloneTracks(tracksRef.current)]);
      setTracks(parsed.tracks);
      setSelectedTrackId(parsed.tracks[0].id);
      if (parsed.bpm) setBpm(Math.max(40, Math.min(240, parsed.bpm)));
      setProjectName(file.name.replace(/\.midi?$/i, "").toUpperCase());
      notify(t.midiImported(parsed.tracks.length));
    } catch {
      notify(t.midiImportFailed);
    }
  }, [notify, stopTransport, t]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { metroRef.current = metronome; }, [metronome]);
  useEffect(() => { loopRef.current = looping; }, [looping]);
  useEffect(() => { currentStepRef.current = currentStep; }, [currentStep]);
  useEffect(() => { recordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { stepInputRef.current = stepInput; }, [stepInput]);

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
        <button className="brand" onClick={() => notify(t.brandToast)} aria-label="TupTup Studio">
          <span className="brand-emblem" aria-hidden="true"><i /><i /><i /></span>
          <span><b>TUPTUP</b><small>STUDIO</small></span>
        </button>
        <div className="project-title">
          <span>{t.project.toUpperCase()}</span>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value.toUpperCase())} aria-label={t.projectName} />
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
        <input ref={importInputRef} className="visually-hidden" type="file" accept=".mid,.midi,audio/midi" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importMidi(file); event.currentTarget.value = ""; }} />
      </header>

      <section className="transport" aria-label={t.transport}>
        <div className="transport-left">
          <button className="mobile-toggle" onClick={() => setMobilePanel("library")} aria-label={t.openLibrary}>☰</button>
          <button onClick={undo} disabled={!history.length} aria-label={t.undo}>↶</button>
          <button onClick={redo} disabled={!future.length} aria-label={t.redo}>↷</button>
          <span className="transport-divider" />
          <button className={metronome ? "active-control" : ""} onClick={() => setMetronome((value) => !value)} aria-pressed={metronome} title={`${t.metronome} (M)`}>⌁<small>{locale === "zh" ? "节拍" : "CLICK"}</small></button>
          <label className="tempo-control"><span>{t.tempo.toUpperCase()}</span><input aria-label={t.tempo} type="number" min="40" max="240" value={bpm} onChange={(event) => setBpm(Math.max(40, Math.min(240, Number(event.target.value) || 40)))} /><b>BPM</b></label>
          <button className={countIn ? "active-control" : ""} onClick={() => setCountIn((value) => !value)} title={t.countIn}>1·2</button>
        </div>
        <div className="transport-center">
          <button onClick={() => { currentStepRef.current = 0; setCurrentStep(0); }} aria-label={t.returnStart}>|◀</button>
          <button className="play-button" onClick={togglePlay} aria-label={isPlaying ? t.pause : t.play}>{isPlaying ? "Ⅱ" : "▶"}</button>
          <button className={`record-button ${isRecording ? "recording" : ""}`} onClick={toggleRecord} aria-label={isRecording ? t.stopRecording : t.record}><i /></button>
          <div className="time-display"><strong>{measure}.{beat}.{subdivision}</strong><span>{locale === "zh" ? "小节 · 拍 · 格" : "BAR · BEAT · STEP"}</span></div>
        </div>
        <div className="transport-right">
          <button className={looping ? "active-control" : ""} onClick={() => setLooping((value) => !value)} aria-pressed={looping} aria-label={t.loop}>↻<small>{t.loop.toUpperCase()}</small></button>
          <label className="master-control"><span>{t.master.toUpperCase()}</span><input aria-label={t.master} type="range" min="0" max="100" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} /><b>{masterVolume}</b></label>
          <button onClick={() => setModal("audio")} aria-label={t.audioSettings}>⚙</button>
          <button className="mobile-toggle" onClick={() => setMobilePanel("mixer")} aria-label={t.openMixer}>◫</button>
        </div>
      </section>

      <section className="workspace">
        <aside className={`library-panel ${mobilePanel === "library" ? "mobile-open" : ""}`}>
          <div className="panel-heading"><div><span>{t.browser.toUpperCase()}</span><strong>{t.libraryTitle}</strong></div><button className="panel-close" onClick={() => setMobilePanel(null)} aria-label={t.closePanel}>×</button></div>
          <div className="instrument-library">
            <div className="library-group"><span>{t.studioCollection.toUpperCase()} · {CORE_INSTRUMENTS.length}</span></div>
            {CORE_INSTRUMENTS.map((instrument) => (
              <button key={instrument.id} className={selectedTrack?.instrument === instrument.id ? "selected" : ""} onClick={() => { changeInstrument(instrument.id); setMobilePanel(null); }}>
                <i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrumentName(instrument, locale)}</strong><small>{instrumentFamily(instrument, locale)}</small></span><b>›</b>
              </button>
            ))}
            <div className="library-group chinese"><span>{t.chineseCollection.toUpperCase()} · {CHINESE_INSTRUMENTS.length}</span><div><button onClick={() => setModal("samples")}>{t.credits}</button><button onClick={addChineseSuite}>＋ {t.fullSuite}</button></div></div>
            {CHINESE_INSTRUMENTS.map((instrument) => (
              <button key={instrument.id} className={`${selectedTrack?.instrument === instrument.id ? "selected" : ""} sample-instrument`} onClick={() => { changeInstrument(instrument.id); setMobilePanel(null); }}>
                <i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrumentName(instrument, locale)}</strong><small>{instrumentFamily(instrument, locale)} · {sampleStatus[instrument.id] === "ready" ? t.ready : sampleStatus[instrument.id] === "loading" ? t.loading : sampleStatus[instrument.id] === "error" ? t.synthFallback : t.loadOnDemand}</small></span><b className={sampleStatus[instrument.id] ?? "idle"}>{sampleStatus[instrument.id] === "loading" ? "◌" : sampleStatus[instrument.id] === "ready" ? "●" : "↓"}</b>
              </button>
            ))}
          </div>
        </aside>

        <section className="center-stage">
          <div className="arrangement-panel">
            <div className="section-bar">
              <div><span>{t.arrangement.toUpperCase()}</span><strong>{t.arrangementTitle}</strong></div>
              <div className="editing-tools">
                <button className="selected" title={t.selectTool}>↖</button><button title={t.pencilTool}>✎</button><button title={t.splitTool}>／</button>
                <span />
                <label>{t.grid.toUpperCase()} <select aria-label={t.gridAccuracy}><option>1/16</option><option>1/8</option><option>1/4</option></select></label>
                <button onClick={() => setModal("shortcuts")} aria-label={t.keyCommands}>?</button>
              </div>
            </div>
            <div className="arrangement-scroll">
              <div className="ruler-row">
                <div className="track-label-header"><span>{t.tracks.toUpperCase()}</span><button onClick={() => setModal("new-track")}>＋ {t.add.toUpperCase()}</button></div>
                <div className="ruler-grid" onPointerDown={setPlayhead}>
                  {Array.from({ length: 8 }, (_, i) => <span key={i} style={{ left: `${i * 12.5}%` }}>{i < 4 ? `1.${i + 1}` : `2.${i - 3}`}</span>)}
                  <i className="loop-range" />
                </div>
              </div>
              <div className="track-lanes">
                <div className="playhead" style={{ left: `calc(228px + (100% - 228px) * ${currentStep / LOOP_STEPS})` }}><i /><span /></div>
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
                    <div className="lane-grid" onPointerDown={setPlayhead}>
                      <div className="clip-block" style={{ borderColor: track.color, background: `color-mix(in srgb, ${track.color} 17%, #15171d)` }}>
                        <span>{track.name} · {track.notes.length} {t.notes.toUpperCase()}</span>
                        {track.notes.map((note) => (
                          <i key={note.id} style={{ left: `${note.start / LOOP_STEPS * 100}%`, width: `${Math.max(1, note.duration) / LOOP_STEPS * 100}%`, top: `${12 + ((84 - note.note + 120) % 7) * 4}px`, background: track.color }} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <button className="add-lane" onClick={() => setModal("new-track")}>＋ {t.addInstrumentTrack}</button>
              </div>
            </div>
          </div>

          <div className="piano-roll-panel">
            <div className="editor-toolbar">
              <div><span>{t.pianoRoll.toUpperCase()}</span><strong>{selectedTrack?.name}</strong></div>
              <div>
                <button onClick={() => editSelectedNotes("quantize")}>{t.quantize}</button>
                <button onClick={() => editSelectedNotes("humanize")}>{t.humanize}</button>
                <button onClick={() => editSelectedNotes("duplicate")} disabled={!selectedNote}>{t.duplicate}</button>
                <button onClick={() => editSelectedNotes("delete")} disabled={!selectedNote}>{t.delete}</button>
                <span className="velocity-chip">VEL {selectedNote?.velocity ?? "—"}</span>
              </div>
            </div>
            <div className="roll-input-bar">
              <button className={stepInput ? "engaged" : ""} aria-pressed={stepInput} onClick={() => setStepInput((enabled) => { const next = !enabled; stepInputRef.current = next; return next; })}><i />{t.stepInput}</button>
              <p><strong>{t.stepInputHint}</strong><span>{t.liveRecordHint}</span></p>
              <a href="/guide#roll-input">{t.learnMore} ↗</a>
            </div>
            <div className="roll-body">
              <div className="roll-key-labels" aria-hidden="true">
                {editorNotes.map((note) => <span className={isBlack(note) ? "black" : ""} key={note}>{note % 12 === 0 ? noteName(note) : ""}</span>)}
              </div>
              <div className="roll-grid" onPointerDown={addEditorNote} aria-label={t.rollHelp}>
                {Array.from({ length: LOOP_STEPS }, (_, i) => <i key={i} className={i % 4 === 0 ? "beat" : ""} style={{ left: `${i / LOOP_STEPS * 100}%` }} />)}
                {editorNotes.map((note, i) => <span key={note} className={isBlack(note) ? "black-row" : ""} style={{ top: `${i / editorNotes.length * 100}%`, height: `${100 / editorNotes.length}%` }} />)}
                <div className="roll-playhead" style={{ left: `${currentStep / LOOP_STEPS * 100}%` }} />
                {selectedTrack?.notes.filter((note) => note.note >= EDITOR_LOW && note.note <= EDITOR_HIGH).map((note) => (
                  <button key={note.id} className={`roll-note ${selectedNoteId === note.id ? "selected" : ""}`} style={{ left: `${note.start / LOOP_STEPS * 100}%`, width: `${Math.max(1, note.duration) / LOOP_STEPS * 100}%`, top: `${(EDITOR_HIGH - note.note) / editorNotes.length * 100}%`, height: `${100 / editorNotes.length}%`, background: selectedTrack.color }} onPointerDown={(event) => { event.stopPropagation(); setSelectedNoteId(note.id); }} onDoubleClick={() => { setSelectedNoteId(note.id); editSelectedNotes("delete"); }} aria-label={`${noteName(note.note)}, ${t.stepLabel(note.start + 1)}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="performance-panel">
            <div className="performance-strip">
              <div><span>{t.liveInput.toUpperCase()}</span><strong>{instrumentName(selectedInstrument, locale)}</strong><small>{selectedInstrument.sample ? `${selectedInstrument.sample.source} · ${sampleStatus[selectedInstrument.id] === "ready" ? t.sampleReady.toUpperCase() : sampleStatus[selectedInstrument.id] === "loading" ? t.loading.toUpperCase() : t.playToLoad.toUpperCase()}` : connection === "connected" ? deviceName : t.computerKeys.toUpperCase()}</small></div>
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
          <div className="panel-heading"><div><span>{t.channelStrip.toUpperCase()}</span><strong>{t.trackMixer}</strong></div><button className="panel-close" onClick={() => setMobilePanel(null)} aria-label={t.closePanel}>×</button></div>
          <div className="channel-identity"><i style={{ background: selectedTrack?.color }} /> <div><span>{t.selectedTrack.toUpperCase()}</span><input value={selectedTrack?.name ?? ""} onChange={(event) => updateTrack(selectedTrackId, { name: event.target.value.toUpperCase() })} aria-label={t.trackName} /></div><b>{String(tracks.findIndex((track) => track.id === selectedTrackId) + 1).padStart(2, "0")}</b></div>
          <div className="channel-controls">
            <label><span>{t.pan.toUpperCase()}</span><input type="range" min="-100" max="100" value={selectedTrack?.pan ?? 0} onChange={(event) => updateTrack(selectedTrackId, { pan: Number(event.target.value) })} /><b>{selectedTrack?.pan === 0 ? "C" : selectedTrack && selectedTrack.pan < 0 ? `L${Math.abs(selectedTrack.pan)}` : `R${selectedTrack?.pan}`}</b></label>
            <div className="fader-wrap"><div className="meter-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><input className="vertical-fader" type="range" min="0" max="100" value={selectedTrack?.volume ?? 0} onChange={(event) => updateTrack(selectedTrackId, { volume: Number(event.target.value) })} /><div className="db-scale"><span>0</span><span>-6</span><span>-12</span><span>-24</span><span>-∞</span></div></div>
            <div className="channel-buttons"><button className={selectedTrack?.mute ? "engaged" : ""} onClick={() => updateTrack(selectedTrackId, { mute: !selectedTrack?.mute })}>{t.mute.toUpperCase()}</button><button className={selectedTrack?.solo ? "engaged solo" : ""} onClick={() => updateTrack(selectedTrackId, { solo: !selectedTrack?.solo })}>{t.solo.toUpperCase()}</button><button className={selectedTrack?.arm ? "armed" : ""} onClick={() => setArmedTrack(selectedTrackId)}>● {t.arm.toUpperCase()}</button></div>
          </div>
          <button className="delete-track" disabled={tracks.length <= 1} onClick={deleteSelectedTrack}>{t.deleteTrack}</button>
        </aside>
      </section>

      <footer className="status-bar"><span><i className={connection === "connected" ? "online" : ""} /> {t.audioEngine.toUpperCase()} · 48 KHZ</span><span>{t.polyphony.toUpperCase()} {voiceCount}/64</span><span>MIDI RX {String(midiEventCount).padStart(4, "0")}</span><span>{t.autosave.toUpperCase()}</span><span className="cpu">CPU <i><b style={{ width: `${Math.min(90, 12 + voiceCount * 6)}%` }} /></i></span></footer>

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
        <section className={`modal-card modal-${modal}`} role="dialog" aria-modal="true" aria-label={modal === "new-track" ? t.chooseInstrument : modal === "audio" ? t.audioRecordingSettings : modal === "shortcuts" ? t.keyCommands : modal === "export" ? t.takeYourMusic : t.sampleCredits}>
          <button className="modal-close" onClick={() => setModal(null)} aria-label={t.closePanel}>×</button>
          {modal === "new-track" && <>
            <div className="modal-title"><span>{t.addTrack.toUpperCase()}</span><h2>{t.chooseInstrument}</h2><p>{t.sharedKeyboardHelp}</p></div>
            <button className="suite-action" onClick={addChineseSuite}><span><b>{t.chineseSuite}</b><small>{t.chineseSuiteList}</small></span><strong>＋ {t.addEightTracks}</strong></button>
            <div className="instrument-grid">{INSTRUMENTS.map((instrument) => <button key={instrument.id} onClick={() => addTrack(instrument.id)}><i style={{ background: instrument.color }}>{instrument.icon}</i><span><strong>{instrumentName(instrument, locale)}</strong><small>{instrumentFamily(instrument, locale)}{instrument.sample ? ` · ${t.sampleBadge.toUpperCase()}` : ""}</small></span><b>＋</b></button>)}</div>
          </>}
          {modal === "audio" && <>
            <div className="modal-title"><span>{t.settings.toUpperCase()}</span><h2>{t.audioRecordingSettings}</h2><p>{t.lowLatencyHelp}</p></div>
            <div className="settings-list">
              <div><span><strong>{t.audioBuffer}</strong><small>{t.bufferHelp}</small></span><select aria-label={t.audioBuffer}><option>128 samples · 2.7 ms</option><option>256 samples · 5.3 ms</option><option>512 samples · 10.7 ms</option></select></div>
              <div><span><strong>{t.sampleRate}</strong><small>{t.sampleRateHelp}</small></span><select aria-label={t.sampleRate}><option>48 kHz</option><option>44.1 kHz</option></select></div>
              <div><span><strong>{t.recordingCountIn}</strong><small>{t.recordingCountInHelp}</small></span><input aria-label={t.recordingCountIn} type="checkbox" checked={countIn} onChange={(event) => setCountIn(event.target.checked)} /></div>
              <div><span><strong>{t.loopRecording}</strong><small>{t.loopRecordingHelp}</small></span><input aria-label={t.loopRecording} type="checkbox" checked={looping} onChange={(event) => setLooping(event.target.checked)} /></div>
            </div>
            <button className="primary-action" onClick={() => setModal(null)}>{t.done}</button>
          </>}
          {modal === "shortcuts" && <>
            <div className="modal-title"><span>{t.keyCommands.toUpperCase()}</span><h2>{t.handsOnMusic}</h2><p>{t.keyboardMidiTogether}</p></div>
            <div className="shortcut-grid"><div><kbd>Space</kbd><span>{t.playPause}</span></div><div><kbd>R</kbd><span>{t.startStopRecording}</span></div><div><kbd>M</kbd><span>{t.metronome}</span></div><div><kbd>Shift</kbd><span>{t.sustainPedal}</span></div><div><kbd>A – K</kbd><span>{t.playCurrentSound}</span></div><div><kbd>⌘ Z</kbd><span>{t.undoEdit}</span></div><div><kbd>Delete</kbd><span>{t.deleteSelectedNote}</span></div><div><kbd>⌘ S</kbd><span>{t.saveLocally}</span></div></div>
          </>}
          {modal === "export" && <>
            <div className="modal-title"><span>{t.bounceShare.toUpperCase()}</span><h2>{t.takeYourMusic}</h2><p>{t.trackCount(tracks.length)} · {t.noteCount(tracks.reduce((count, track) => count + track.notes.length, 0))} · {bpm} BPM</p></div>
            <div className="export-options"><button onClick={() => exportProject("midi")}><i>.MID</i><span><strong>{t.standardMidi}</strong><small>{t.midiCompatibility}</small></span><b>{t.download} ↗</b></button><button onClick={() => exportProject("json")}><i>.JSON</i><span><strong>{t.projectBundle}</strong><small>{t.projectBundleHelp}</small></span><b>{t.download} ↗</b></button></div>
            <p className="privacy-note">{t.privacyPromise}</p>
          </>}
          {modal === "samples" && <>
            <div className="modal-title"><span>{t.sampleCredits.toUpperCase()}</span><h2>{t.sampleSuiteTitle}</h2><p>{t.sampleCreditsHelp}</p></div>
            <div className="sample-credit-list"><div><i style={{ background: "#dd7f6f" }}>胡</i><span><strong>{instrumentName(instrumentById("erhu"), locale)}</strong><small>{t.erhuPerformance}</small></span><b>Berklee BISA<br />CC BY 4.0</b></div><div><i style={{ background: "#e7bd62" }}>采</i><span><strong>{t.remainingSeven}</strong><small>{t.soundfontMapping}</small></span><b>FluidR3 GM<br />CC BY 3.0</b></div></div>
            <div className="sample-links"><a href="https://remix.berklee.edu/bisa-chinese-erhu/" target="_blank" rel="noreferrer">{t.berkleeSource} ↗</a><a href="https://github.com/gleitz/midi-js-soundfonts" target="_blank" rel="noreferrer">{t.fluidSource} ↗</a></div><button className="primary-action" onClick={() => setModal(null)}>{t.done}</button>
          </>}
        </section>
      </div>}

      {mobilePanel && <button className="mobile-scrim" onClick={() => setMobilePanel(null)} aria-label={t.closePanel} />}
      {toast && <div className="toast" role="status"><i />{toast}</div>}
    </main>
  );
}
