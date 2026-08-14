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
    nav: ["快速开始", "写入卷帘", "工作台", "歌曲模式", "快捷键", "常见问题"],
    quickTitle: "60 秒快速开始",
    quickIntro: "不接 MIDI 设备也可以完成这套流程。电脑键盘 A–K 和屏幕钢琴都能直接演奏。",
    quickSteps: [
      ["01", "选择音轨与音色", "在编曲区点选音轨，再从左侧音色库选择乐器。可先点每件乐器右侧的 ▶ 试听；所有输入都会进入当前选中的音轨。"],
      ["02", "创建或选择 Clip", "选择铅笔后点击音轨，或直接待录并演奏。没有活动 Clip 时，第一颗录入音符会在播放头自动建立片段。"],
      ["03", "开启步进输入", "打开当前 Clip 的 Piano Roll，选择步长，点亮“步进输入”，然后演奏屏幕键盘、A–K 或 MIDI 键盘。"],
      ["04", "生成、编辑与播放歌曲", "点编曲栏的“随机整曲”，可一次生成 3–6 个连续段落，并选择混合、电子、Lo-Fi、电影、国风或放克；每段自动改变配器。单个 Clip 仍可用“随机灵感”继续变化。"],
    ],
    rollEyebrow: "核心操作", rollTitle: "键盘如何添加到 Piano Roll？",
    rollIntro: "演奏键盘本身负责发声；是否写入卷帘，由下面三种录入方式决定。第一次使用推荐“步进输入”。",
    methods: [
      ["推荐", "步进输入", "适合逐音写旋律与和弦", "选择 Clip → 移动播放头 → 选择步长 → 开启步进输入 → 演奏。播放头按网格前进；连续按键写旋律，同时按下可录入和弦。"],
      ["演奏", "实时录音", "保留真实节奏和时值", "点亮目标音轨的待录按钮 ●，按 R 或顶部红色录音键，再用任意键盘演奏。一小节预备拍、力度、松键、延音踏板和循环跨界都会写入；循环开启时继续 Overdub。"],
      ["编辑", "手动画入", "适合修补与精确编排", "选铅笔后点击空白，或双击网格添加音符。选择工具可框选；“随机灵感”会保留节奏并变化音高与力度，空白时直接生成素材；所有操作均可撤销。"],
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
      ["02", "上方 · 编曲时间线", "缩放和滚动完整歌曲；“随机整曲”生成带风格标记的多段落编曲，也可手动管理音轨、Clip、网格、拍号、播放跟随和循环范围。"],
      ["03", "中部 · 钢琴卷帘", "只编辑当前 Clip：随机灵感、框选、多音符拖动/缩放、力度、量化强度、人性化与可选步长都在这里。"],
      ["04", "下方 · 共享键盘", "所有音轨共用这一套 61 键输入，切换音轨后无需重新绑定。"],
      ["05", "右侧 · 通道条", "只保留当前音轨的声像、音量、静音、独奏、待录和删除。"],
    ],
    details: [
      ["SOUNDS", "采样状态与音色检查", "所有 17 件乐器首次使用都会立即以合成音色发声，并在后台下载约 1.7–3 MB 的公开高清采样。采样原始响应会保存在浏览器缓存。点音色库标题旁的“✓ 17”可逐件试听、重试，或主动检查全部；全量检查约需 30–45 MB，不会在启动时自动执行。"],
      ["TRANSPORT", "播放、节拍器与循环", "顶部传输栏控制播放、录音、BPM、节拍器、预备拍、循环和主音量。红色播放头在编曲区与钢琴卷帘中保持同一位置。"],
      ["PROJECT", "编辑、恢复与导出", "统一撤销覆盖音轨、Clip、音符、BPM、拍号和混音。v3 工程与恢复快照保存在 IndexedDB；可导入 v2/v3 JSON，并导出完整长歌曲 MIDI。"],
    ],
    songTitle: "Song Mode 与 Clip 操作",
    songIntro: "工程以 PPQ 480 的精确 tick 保存。默认 16 小节；录音、移动或导入超过结尾时，会按 4 小节自动延长，不再折回固定两小节循环。",
    songItems: [
      ["RANDOM SONG", "多段落风格化编曲", "点编曲栏的“随机整曲”，选择 3–6 段与风格方向。混合模式会在段落间轮换五种风格；单一风格会保持调性方向，但前奏、主歌、副歌、桥段和终章使用不同乐器组合。生成会替换当前编曲，并可一次撤销。"],
      ["CLIP", "创建、移动与缩放", "铅笔点击空白音轨创建；拖动主体移动，拖左右边缘缩放。打开 Clip Loop 后，拉长右边缘会重复内容而不是复制源音符。工具栏可复制、切割和删除。"],
      ["LOOP RECORD", "独立循环与 Overdub", "顶部 Loop 输入设置开始/结束小节。循环只改变播放和录音范围；实时录音可以跨边界写入长音，并在每轮继续叠加。"],
      ["MIDI", "长歌曲往返", "导入保留绝对长度、重叠同音、Program、鼓通道、BPM 与拍号。导出会展开循环 Clip，并正确排序同一 tick 的 Note Off / Note On。"],
      ["MOBILE", "手机聚焦标签", "390 px 宽度下使用“编曲 / 卷帘 / 演奏 / 混音”切换工作区；传输栏和播放头跨标签同步，音色库与混音器仍从侧边拉出。"],
      ["MIGRATION", "v2 自动迁移", "旧 32 格工程会进入一个两小节 Clip，保留乐器、混音、音符位置和力度。迁移成功前不会删除旧的本机数据。"],
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
      ["为什么导入旧工程后只看到一个 Clip？", "v2 使用固定 32 格结构。迁移会把这些音符完整放进一个两小节 Clip；之后可以复制、切割或循环拉伸，并继续编排完整歌曲。"],
      ["随机整曲会覆盖现在的内容吗？", "会替换当前音轨与 Clip，但整个生成动作只写入一次历史记录；按撤销即可完整恢复。若只想变化当前片段，请使用钢琴卷帘里的“随机灵感”。"],
    ],
    privacy: "本地优先 · 不上传演奏数据", footer: "TupTup Studio 是面向浏览器的多轨 MIDI 工作站。",
  },
  en: {
    eyebrow: "TUPTUP STUDIO · FEATURE GUIDE", title: "From the first note to a full arrangement",
    intro: "A practical guide to the workstation. Learn the layout, then use Step Input, live recording, or drawing to place performances in the piano roll.",
    back: "Back to Studio", language: "中", nav: ["Quick Start", "Piano Roll", "Workspace", "Song Mode", "Shortcuts", "FAQ"],
    quickTitle: "60-second quick start",
    quickIntro: "No MIDI hardware is required. The computer keys A–K and the on-screen piano can both play and enter notes.",
    quickSteps: [
      ["01", "Choose a track and sound", "Select a track in the arrangement, then choose an instrument from the library. Use the ▶ beside any instrument to preview it; input always goes to the selected track."],
      ["02", "Create or select a clip", "Choose Pencil and click a lane, or arm and perform. When no clip is active, the first entered note creates one at the playhead."],
      ["03", "Enable Step Input", "Open the active clip in the Piano Roll, choose a step length, enable Step Input, then play the screen piano, A–K, or MIDI."],
      ["04", "Generate, edit, and play", "Use Random Song in the arrangement bar to create 3–6 consecutive sections in Mixed, Synthwave, Lo-Fi, Cinematic, Guofeng, or Funk styles. Instrument layers change by section; Random Idea still varies one Clip."],
    ],
    rollEyebrow: "CORE WORKFLOW", rollTitle: "How does the keyboard add notes to the Piano Roll?",
    rollIntro: "The keyboard always plays sound. Whether it writes notes depends on one of the three input modes below. Step Input is best for a first session.",
    methods: [
      ["Recommended", "Step Input", "Write melodies and chords one step at a time", "Select a clip → place the playhead → choose a length → enable Step Input → play. The playhead advances on the grid; consecutive notes form a melody and held notes form a chord."],
      ["Performance", "Live Recording", "Keep natural timing and note lengths", "Arm with ●, press R, then perform. Count-in, velocity, note-off, sustain, and notes crossing the loop are captured; enabled loops keep overdubbing."],
      ["Editing", "Draw Notes", "Repair and arrange with precision", "Choose Pencil and click, or double-click the grid. Random Idea preserves rhythm while varying pitch and velocity, or creates material in an empty clip; every result is undoable."],
    ],
    signalTitle: "One keyboard, three entry points",
    signalItems: [["Screen piano", "The fixed 61-key piano at the bottom supports mouse and touch."], ["Computer keys", "A W S E D F T G Y H U J K play 13 consecutive semitones."], ["MIDI keyboard", "After Connect Device permission is granted, every MIDI input port is monitored."]],
    workspaceTitle: "The simplified workspace",
    workspaceIntro: "Each task now has one clear home, so tracks, sounds, and mix controls are not repeated across the interface.",
    zones: [
      ["01", "Left · Sound Library", "Browse and change all 17 sample instruments. ↓ means first download pending, ◌ loading, ✓ cached, and ≈ a safe synth fallback is active."],
      ["02", "Top · Arrangement", "Zoom and scroll the full song. Random Song creates marked, multi-section arrangements; tracks, Clips, grid, meter, follow mode, and loop range remain editable by hand."],
      ["03", "Middle · Piano Roll", "Edit only the active clip with Random Idea, marquee, group drag/resize, velocity, quantize strength, humanize, and selectable step lengths."],
      ["04", "Bottom · Shared Keyboard", "Every track uses the same fixed 61-key input; switching tracks never requires rebinding."],
      ["05", "Right · Channel Strip", "Focused controls for the selected track: pan, volume, mute, solo, arm, and delete."],
    ],
    details: [
      ["SOUNDS", "Sample status and Sound Check", "All 17 instruments respond instantly with synthesis on first use while an open HD sample of about 1.7–3 MB downloads in the background. Raw responses persist in the browser cache. Open “✓ 17” beside the library title to preview, retry, or explicitly check every sound. A full check uses about 30–45 MB and never runs at startup."],
      ["TRANSPORT", "Playback, metronome, and loop", "The top transport controls playback, recording, BPM, metronome, count-in, loop, and master volume. The red playhead stays aligned between the arrangement and piano roll."],
      ["PROJECT", "Editing, recovery, and export", "Unified undo covers tracks, clips, notes, BPM, meter, and mix. V3 documents and recovery snapshots use IndexedDB; v2/v3 JSON and full-length MIDI can be imported and exported."],
    ],
    songTitle: "Song Mode and clip operations",
    songIntro: "Projects store musical time as exact PPQ-480 ticks. They start at 16 bars and extend in four-bar blocks when recording, moving, or importing past the end—nothing folds into a fixed two-bar loop.",
    songItems: [
      ["RANDOM SONG", "Styled multi-section arrangements", "Open Random Song in the arrangement bar, choose 3–6 sections and a direction. Mixed mode rotates through five styles; focused modes keep a coherent direction while intro, verse, chorus, bridge, and finale use different instrument combinations. Generation replaces the arrangement as one undoable action."],
      ["CLIP", "Create, move, and resize", "Use Pencil on an empty lane; drag the body to move or either edge to resize. With Clip Loop enabled, extending the right edge repeats content without copying source notes. Duplicate, Split, and Delete live in the toolbar."],
      ["LOOP RECORD", "Independent loop and overdub", "The Loop bar fields set start/end bars. This changes transport and recording, not clip data. Live recording can cross the boundary and keeps overdubbing on later passes."],
      ["MIDI", "Long-song round trip", "Import keeps absolute length, overlapping same-pitch notes, Program, drum channels, BPM, and meter. Export expands looped clips and orders same-tick Note Off before Note On."],
      ["MOBILE", "Focused mobile tabs", "At phone width, Arrangement / Roll / Play / Mix focus one workspace. Transport and playhead remain synchronized; the library and mixer stay in drawers."],
      ["MIGRATION", "Automatic v2 migration", "A legacy 32-step project becomes one two-bar clip while preserving instruments, mix, note positions, and velocity. Old local data remains until v3 recovery succeeds."],
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
      ["Why is an imported old project inside one clip?", "V2 used a fixed 32-step structure. Migration places it intact in a two-bar clip; you can then duplicate, split, loop-stretch, and arrange it into a full song."],
      ["Does Random Song replace my current work?", "It replaces the current tracks and Clips, but the whole generation is one history action—Undo restores everything. Use Random Idea in the Piano Roll when you only want to vary the active Clip."],
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

  const navTargets = ["quick-start", "roll-input", "workspace", "song-mode", "shortcuts", "faq"];

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

      <section className={styles.section} id="song-mode">
        <div className={styles.sectionHeading}><span>04</span><div><h2>{copy.songTitle}</h2><p>{copy.songIntro}</p></div></div>
        <div className={styles.details}>{copy.songItems.map(([label, title, body]) => <article key={label}><span>{label}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className={styles.section} id="shortcuts">
        <div className={styles.sectionHeading}><span>05</span><div><h2>{copy.shortcutsTitle}</h2></div></div>
        <div className={styles.shortcuts}>{copy.shortcuts.map(([key, action]) => <div key={key}><kbd>{key}</kbd><span>{action}</span></div>)}</div>
      </section>

      <section className={styles.section} id="faq">
        <div className={styles.sectionHeading}><span>06</span><div><h2>{copy.faqTitle}</h2></div></div>
        <div className={styles.faq}>{copy.faq.map(([question, answer]) => <details key={question}><summary>{question}<span>＋</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <footer className={styles.footer}><div><span>{copy.privacy}</span><p>{copy.footer}</p></div><Link href="/">{copy.back} ↑</Link></footer>
    </main>
  );
}
