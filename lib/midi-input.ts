export type MidiPerformanceMessage =
  | { type: "note-on"; channel: number; note: number; velocity: number }
  | { type: "note-off"; channel: number; note: number; velocity: number }
  | { type: "sustain"; channel: number; enabled: boolean };

export type MidiInputControllerHandlers = {
  onMessage: (message: MidiPerformanceMessage) => void;
  onInputsChanged: (inputs: readonly MIDIInput[]) => void;
  onError?: (error: unknown) => void;
};

const DEFAULT_DUPLICATE_WINDOW_MS = 4;
const MAX_RECENT_MESSAGES = 64;

export function parseMidiPerformanceMessage(data: ArrayLike<number>): MidiPerformanceMessage | null {
  if (data.length < 3) return null;
  const status = data[0] ?? 0;
  const data1 = data[1] ?? 0;
  const data2 = data[2] ?? 0;
  const command = status & 0xf0;
  const channel = status & 0x0f;

  if (command === 0x90 && data2 > 0) {
    return { type: "note-on", channel, note: data1, velocity: data2 };
  }
  if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    return { type: "note-off", channel, note: data1, velocity: data2 };
  }
  if (command === 0xb0 && data1 === 64) {
    return { type: "sustain", channel, enabled: data2 >= 64 };
  }
  return null;
}

export class MidiInputController {
  private access: MIDIAccess | null = null;
  private inputs = new Map<string, MIDIInput>();
  private generation = 0;
  private reconcilePromise: Promise<readonly MIDIInput[]> | null = null;
  private reconcileAgain = false;
  private recentMessages = new Map<string, { inputId: string; timeStamp: number }>();

  constructor(
    private readonly handlers: MidiInputControllerHandlers,
    private readonly duplicateWindowMs = DEFAULT_DUPLICATE_WINDOW_MS,
  ) {}

  async connect(access: MIDIAccess): Promise<readonly MIDIInput[]> {
    if (this.access !== access) {
      this.detachAccess();
      this.access = access;
      this.generation += 1;
    }
    access.onstatechange = this.handleStateChange;
    return this.reconcile();
  }

  dispose() {
    this.generation += 1;
    this.detachAccess();
    this.reconcileAgain = false;
    this.recentMessages.clear();
  }

  private readonly handleStateChange = () => {
    void this.reconcile().catch((error) => this.handlers.onError?.(error));
  };

  private reconcile(): Promise<readonly MIDIInput[]> {
    if (this.reconcilePromise) {
      this.reconcileAgain = true;
      return this.reconcilePromise;
    }

    const promise = (async () => {
      let opened: readonly MIDIInput[] = [];
      do {
        this.reconcileAgain = false;
        opened = await this.reconcileOnce();
      } while (this.reconcileAgain && this.access);
      return opened;
    })();
    this.reconcilePromise = promise;
    void promise.finally(() => {
      if (this.reconcilePromise === promise) this.reconcilePromise = null;
    }).catch(() => { /* the caller owns the original rejection */ });
    return promise;
  }

  private async reconcileOnce(): Promise<readonly MIDIInput[]> {
    const access = this.access;
    const generation = this.generation;
    if (!access) return [];

    const candidates = Array.from(access.inputs.values()).filter((input) => input.state !== "disconnected");
    const candidateIds = new Set(candidates.map((input) => input.id));
    for (const [inputId, input] of this.inputs) {
      if (!candidateIds.has(inputId) || !candidates.includes(input)) input.onmidimessage = null;
    }

    const opened = (await Promise.all(candidates.map(async (input) => {
      try {
        if (input.connection !== "open") await input.open();
        return input;
      } catch {
        input.onmidimessage = null;
        return null;
      }
    }))).filter((input): input is MIDIInput => input !== null);

    if (this.access !== access || this.generation !== generation) {
      opened.forEach((input) => { input.onmidimessage = null; });
      return [];
    }
    if (candidates.length > 0 && opened.length === 0) throw new Error("No MIDI input opened");

    const nextInputs = new Map<string, MIDIInput>();
    opened.forEach((input) => {
      input.onmidimessage = (event) => this.handleMessage(input.id, event);
      nextInputs.set(input.id, input);
    });
    this.inputs = nextInputs;
    this.handlers.onInputsChanged(opened);
    return opened;
  }

  private handleMessage(inputId: string, event: MIDIMessageEvent) {
    const data = event.data;
    if (!data) return;
    const message = parseMidiPerformanceMessage(data);
    if (!message) return;

    const timeStamp = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const signature = Array.from(data).join(":");
    const previous = this.recentMessages.get(signature);

    if (previous && previous.inputId !== inputId && Math.abs(timeStamp - previous.timeStamp) <= this.duplicateWindowMs) return;
    this.recentMessages.delete(signature);
    this.recentMessages.set(signature, { inputId, timeStamp });

    if (this.recentMessages.size > MAX_RECENT_MESSAGES) {
      const oldest = this.recentMessages.keys().next().value;
      if (oldest !== undefined) this.recentMessages.delete(oldest);
    }
    this.handlers.onMessage(message);
  }

  private detachAccess() {
    if (this.access?.onstatechange === this.handleStateChange) this.access.onstatechange = null;
    this.inputs.forEach((input) => { input.onmidimessage = null; });
    this.inputs.clear();
    this.access = null;
  }
}
