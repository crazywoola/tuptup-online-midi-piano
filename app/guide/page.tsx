"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import styles from "./guide.module.css";

type Locale = "zh" | "en";

const LOCALE_STORAGE_KEY = "tuptup-studio-locale";
const LOCALE_CHANGE_EVENT = "tuptup-locale-change";

function getLocale(): Locale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "zh" || stored === "en" ? stored : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function subscribeToLocale(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCALE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCALE_CHANGE_EVENT, callback);
  };
}

const COPY = {
  zh: {
    eyebrow: "TUPTUP STUDIO · 功能说明书",
    title: "从第一颗音符，到完整编曲",
    intro: "这是一份面向实际操作的快速手册。先看懂工作台，再选择步进输入、实时录音或手动画音符，把演奏写进钢琴卷帘。",
    back: "返回工作台", language: "EN",
    nav: ["快速开始", "写入卷帘", "工作台", "快捷键", "常见问题"],
    quickTitle: "60 秒快速开始",
    quickIntro: "不接 MIDI 设备也可以完成这套流程。电脑键盘 A–K 和屏幕钢琴都能直接演奏。",
    quickSteps: [
      ["01", "选择音轨与音色", "在编曲区点选音轨，再从左侧音色库选择乐器。可先点每件乐器右侧的 ▶ 试听；所有输入都会进入当前选中的音轨。"],
      ["02", "定位播放头", "点击编曲时间线或音轨区域，把红色播放头移动到想要开始的位置。"],
      ["03", "开启步进输入", "在钢琴卷帘上方点亮“步进输入”，然后演奏屏幕键盘、A–K 或 MIDI 键盘。"],
      ["04", "编辑与播放", "每次按键会写入一个 1/16 音符并自动前进。按 Space 播放，点音符后可量化、复制或删除。"],
    ],
    rollEyebrow: "核心操作", rollTitle: "键盘如何添加到 Piano Roll？",
    rollIntro: "演奏键盘本身负责发声；是否写入卷帘，由下面三种录入方式决定。第一次使用推荐“步进输入”。",
    methods: [
      ["推荐", "步进输入", "适合逐音写旋律与和弦", "选择音轨 → 移动播放头 → 开启步进输入 → 演奏。每颗音符长度为 1/16，播放头自动向前一格。连续按键可写旋律，同时按下可录入和弦。"],
      ["演奏", "实时录音", "保留真实节奏和时值", "点亮目标音轨的待录按钮 ●，按 R 或顶部红色录音键，再用任意键盘演奏。松键时间决定音符长度；再次按 R 或停止键结束。"],
      ["编辑", "手动画入", "适合修补与精确编排", "直接点击钢琴卷帘的空白网格即可添加音符。点选音符后可量化、人性化、重复或删除；双击音符也可快速删除。"],
    ],
    signalTitle: "同一个键盘，三种入口",
    signalItems: [
      ["屏幕钢琴", "页面底部 61 键键盘，鼠标、触摸均可演奏。"],
      ["电脑键盘", "A W S E D F T G Y H U J K 对应连续 13 个半音。"],
      ["MIDI 键盘", "点“连接设备”并授权后，所有 MIDI 输入端口都会被监听。"],
    ],
    workspaceTitle: "重新排版后的工作台",
    workspaceIntro: "每类任务只保留一个明确位置，避免音轨、音色与混音控件在多个区域重复出现。",
    zones: [
      ["01", "左侧 · 音色库", "浏览和更换 17 件采样乐器。↓ 表示等待首次下载，◌ 表示加载中，✓ 表示已缓存，≈ 表示正在安全使用合成回退。"],
      ["02", "上方 · 编曲时间线", "音轨的唯一管理区域：选择、静音、独奏、待录、新增与定位播放头。"],
      ["03", "中部 · 钢琴卷帘", "查看和编辑当前音轨的音符，并切换步进输入。"],
      ["04", "下方 · 共享键盘", "所有音轨共用这一套 61 键输入，切换音轨后无需重新绑定。"],
      ["05", "右侧 · 通道条", "只保留当前音轨的声像、音量、静音、独奏、待录和删除。"],
    ],
    details: [
      ["SOUNDS", "采样状态与音色检查", "所有 17 件乐器首次使用都会立即以合成音色发声，并在后台下载约 1.7–3 MB 的公开高清采样。采样原始响应会保存在浏览器缓存。点音色库标题旁的“✓ 17”可逐件试听、重试，或主动检查全部；全量检查约需 30–45 MB，不会在启动时自动执行。"],
      ["TRANSPORT", "播放、节拍器与循环", "顶部传输栏控制播放、录音、BPM、节拍器、预备拍、循环和主音量。红色播放头在编曲区与钢琴卷帘中保持同一位置。"],
      ["PROJECT", "编辑、保存与导出", "编辑支持撤销与重做。工程可保存到本机，也可导出标准 MIDI 或 TupTup JSON 工程包；演奏和导出都在浏览器本地完成。"],
    ],
    shortcutsTitle: "常用快捷键",
    shortcuts: [["Space", "播放 / 暂停"], ["R", "开始 / 停止录音"], ["M", "节拍器"], ["Shift", "延音"], ["A–K", "演奏当前音色"], ["⌘ / Ctrl + Z", "撤销"], ["Delete", "删除选中音符"], ["⌘ / Ctrl + S", "保存到本机"]],
    faqTitle: "常见问题",
    faq: [
      ["按键会响，但卷帘里没有音符？", "确认当前音轨已选中，并开启“步进输入”；或者把音轨设为待录后开始实时录音。普通演奏只发声，不会自动写入。"],
      ["MIDI 键盘没有反应？", "使用桌面版 Chrome 或 Edge，在 HTTPS 正式站点点击“连接设备”并允许 MIDI 权限。嵌入式预览通常无法访问 USB。"],
      ["为什么音色第一次会显示“合成回退”？", "第一颗音符优先立即发声，同时后台下载约 1.7–3 MB 的公开采样。原始音色会持久缓存在此浏览器；网络超时、离线或解码失败时，稳定的合成回退始终可用。"],
      ["如何确认全部 17 件乐器都正常？", "打开左侧音色库标题旁的“✓ 17”，可逐件试听或点“检查全部 17 件乐器”。全量检查约需 30–45 MB，并显示每件乐器的加载、缓存或回退状态。"],
      ["键盘或音轨为什么不会再乱跳？", "键盘和编辑区使用固定尺寸与独立滚动；按键反馈只改变颜色和阴影，不会改变按键尺寸或布局。"],
    ],
    privacy: "本地优先 · 不上传演奏数据", footer: "TupTup Studio 是面向浏览器的多轨 MIDI 工作站。",
  },
  en: {
    eyebrow: "TUPTUP STUDIO · FEATURE GUIDE", title: "From the first note to a full arrangement",
    intro: "A practical guide to the workstation. Learn the layout, then use Step Input, live recording, or drawing to place performances in the piano roll.",
    back: "Back to Studio", language: "中", nav: ["Quick Start", "Piano Roll", "Workspace", "Shortcuts", "FAQ"],
    quickTitle: "60-second quick start",
    quickIntro: "No MIDI hardware is required. The computer keys A–K and the on-screen piano can both play and enter notes.",
    quickSteps: [
      ["01", "Choose a track and sound", "Select a track in the arrangement, then choose an instrument from the library. Use the ▶ beside any instrument to preview it; input always goes to the selected track."],
      ["02", "Place the playhead", "Click the arrangement ruler or a track lane to move the red playhead to your starting point."],
      ["03", "Enable Step Input", "Turn on Step Input above the piano roll, then play the screen piano, A–K, or a MIDI keyboard."],
      ["04", "Edit and play", "Each key press writes a 1/16 note and advances one step. Press Space to play; select notes to quantize, duplicate, or delete."],
    ],
    rollEyebrow: "CORE WORKFLOW", rollTitle: "How does the keyboard add notes to the Piano Roll?",
    rollIntro: "The keyboard always plays sound. Whether it writes notes depends on one of the three input modes below. Step Input is best for a first session.",
    methods: [
      ["Recommended", "Step Input", "Write melodies and chords one step at a time", "Select a track → place the playhead → enable Step Input → play. Each note is 1/16 long and the playhead advances automatically. Play consecutive notes for a melody or press notes together for a chord."],
      ["Performance", "Live Recording", "Keep natural timing and note lengths", "Arm the target track with ●, press R or the red Record control, and perform with any keyboard. Note-off timing determines duration. Press R or Stop again to finish."],
      ["Editing", "Draw Notes", "Repair and arrange with precision", "Click an empty piano-roll cell to add a note. Select a note to quantize, humanize, duplicate, or delete it. Double-clicking a note also deletes it."],
    ],
    signalTitle: "One keyboard, three entry points",
    signalItems: [["Screen piano", "The fixed 61-key piano at the bottom supports mouse and touch."], ["Computer keys", "A W S E D F T G Y H U J K play 13 consecutive semitones."], ["MIDI keyboard", "After Connect Device permission is granted, every MIDI input port is monitored."]],
    workspaceTitle: "The simplified workspace",
    workspaceIntro: "Each task now has one clear home, so tracks, sounds, and mix controls are not repeated across the interface.",
    zones: [
      ["01", "Left · Sound Library", "Browse and change all 17 sample instruments. ↓ means first download pending, ◌ loading, ✓ cached, and ≈ a safe synth fallback is active."],
      ["02", "Top · Arrangement", "The single place to select, mute, solo, arm, add tracks, and position the playhead."],
      ["03", "Middle · Piano Roll", "View and edit the selected track’s notes, and toggle Step Input."],
      ["04", "Bottom · Shared Keyboard", "Every track uses the same fixed 61-key input; switching tracks never requires rebinding."],
      ["05", "Right · Channel Strip", "Focused controls for the selected track: pan, volume, mute, solo, arm, and delete."],
    ],
    details: [
      ["SOUNDS", "Sample status and Sound Check", "All 17 instruments respond instantly with synthesis on first use while an open HD sample of about 1.7–3 MB downloads in the background. Raw responses persist in the browser cache. Open “✓ 17” beside the library title to preview, retry, or explicitly check every sound. A full check uses about 30–45 MB and never runs at startup."],
      ["TRANSPORT", "Playback, metronome, and loop", "The top transport controls playback, recording, BPM, metronome, count-in, loop, and master volume. The red playhead stays aligned between the arrangement and piano roll."],
      ["PROJECT", "Editing, saving, and export", "Edits support undo and redo. Save locally, export Standard MIDI, or download a TupTup JSON project bundle. Performance and export stay in your browser."],
    ],
    shortcutsTitle: "Essential shortcuts",
    shortcuts: [["Space", "Play / Pause"], ["R", "Start / Stop Recording"], ["M", "Toggle Metronome"], ["Shift", "Sustain"], ["A–K", "Play Current Sound"], ["⌘ / Ctrl + Z", "Undo"], ["Delete", "Delete Selected Note"], ["⌘ / Ctrl + S", "Save Locally"]],
    faqTitle: "Frequently asked questions",
    faq: [
      ["Keys make sound, but no notes appear?", "Select the target track and enable Step Input, or arm the track and start live recording. Normal playing produces sound without writing notes."],
      ["The MIDI keyboard does not respond?", "Use desktop Chrome or Edge, open the HTTPS live site, choose Connect Device, and grant MIDI permission. Embedded previews often cannot access USB."],
      ["Why does a sound show “Synth Fallback” at first?", "The first note plays immediately while an open sample of about 1.7–3 MB downloads in the background. Raw sounds persist in this browser; the stable synth fallback remains playable after a timeout, offline request, or decode failure."],
      ["How do I verify all 17 instruments?", "Open “✓ 17” beside the Sound Library title. Preview sounds one by one or choose Check All 17 Instruments. A full check uses about 30–45 MB and shows the load, cache, or fallback result for each instrument."],
      ["Why do the keyboard and tracks stay stable now?", "The keyboard and editors use fixed geometry with independent scrolling. Key feedback changes only color and shadow, never size or layout."],
    ],
    privacy: "LOCAL FIRST · PERFORMANCE DATA IS NOT UPLOADED", footer: "TupTup Studio is a multitrack MIDI workstation for the browser.",
  },
} as const;

export default function GuidePage() {
  const locale = useSyncExternalStore<Locale>(subscribeToLocale, getLocale, () => "zh");
  const copy = COPY[locale];

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  function switchLocale() {
    const next: Locale = locale === "zh" ? "en" : "zh";
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }

  const navTargets = ["quick-start", "roll-input", "workspace", "shortcuts", "faq"];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={copy.back}>
          <span className={styles.emblem}><i /><i /><i /></span><span><b>TUPTUP</b><small>STUDIO GUIDE</small></span>
        </Link>
        <nav aria-label="Guide sections">{copy.nav.map((label, index) => <a key={navTargets[index]} href={`#${navTargets[index]}`}>{label}</a>)}</nav>
        <div className={styles.headerActions}><button onClick={switchLocale} aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}>{copy.language}</button><Link href="/">← {copy.back}</Link></div>
      </header>

      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.intro}</p><div className={styles.heroActions}><a href="#quick-start">{copy.quickTitle} ↓</a><Link href="/">{copy.back} ↗</Link></div></div>
        <div className={styles.heroDiagram} aria-label={copy.rollTitle}>
          <span>INPUT</span><div><kbd>A–K</kbd><kbd>MIDI</kbd><kbd>61 KEYS</kbd></div><i>↓</i><strong>STEP INPUT</strong><i>↓</i>
          <div className={styles.miniRoll}>{Array.from({ length: 16 }, (_, index) => <b className={[2, 5, 7, 10].includes(index) ? styles.hit : ""} key={index} />)}</div><small>PIANO ROLL · 1/16</small>
        </div>
      </section>

      <section className={styles.section} id="quick-start">
        <div className={styles.sectionHeading}><span>01</span><div><h2>{copy.quickTitle}</h2><p>{copy.quickIntro}</p></div></div>
        <div className={styles.steps}>{copy.quickSteps.map(([number, title, body]) => <article key={number}><b>{number}</b><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className={`${styles.section} ${styles.rollSection}`} id="roll-input">
        <div className={styles.sectionHeading}><span>02</span><div><small>{copy.rollEyebrow}</small><h2>{copy.rollTitle}</h2><p>{copy.rollIntro}</p></div></div>
        <div className={styles.methods}>{copy.methods.map(([badge, title, subtitle, body], index) => <article className={index === 0 ? styles.recommended : ""} key={title}><span>{badge}</span><b>0{index + 1}</b><h3>{title}</h3><strong>{subtitle}</strong><p>{body}</p></article>)}</div>
        <div className={styles.signalFlow}><h3>{copy.signalTitle}</h3><div>{copy.signalItems.map(([title, body]) => <article key={title}><strong>{title}</strong><p>{body}</p></article>)}</div><span>→ STEP INPUT / RECORD → PIANO ROLL</span></div>
      </section>

      <section className={styles.section} id="workspace">
        <div className={styles.sectionHeading}><span>03</span><div><h2>{copy.workspaceTitle}</h2><p>{copy.workspaceIntro}</p></div></div>
        <div className={styles.zones}>{copy.zones.map(([number, title, body]) => <article key={number}><b>{number}</b><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
        <div className={styles.details}>{copy.details.map(([label, title, body]) => <article key={label}><span>{label}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className={styles.section} id="shortcuts">
        <div className={styles.sectionHeading}><span>04</span><div><h2>{copy.shortcutsTitle}</h2></div></div>
        <div className={styles.shortcuts}>{copy.shortcuts.map(([key, action]) => <div key={key}><kbd>{key}</kbd><span>{action}</span></div>)}</div>
      </section>

      <section className={styles.section} id="faq">
        <div className={styles.sectionHeading}><span>05</span><div><h2>{copy.faqTitle}</h2></div></div>
        <div className={styles.faq}>{copy.faq.map(([question, answer]) => <details key={question}><summary>{question}<span>＋</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <footer className={styles.footer}><div><span>{copy.privacy}</span><p>{copy.footer}</p></div><Link href="/">{copy.back} ↑</Link></footer>
    </main>
  );
}
