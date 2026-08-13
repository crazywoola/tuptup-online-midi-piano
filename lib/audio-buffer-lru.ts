export type AudioBufferLike = {
  length: number;
  numberOfChannels: number;
};

type Entry<T> = { value: T; bytes: number; touched: number };

export class AudioBufferLru<T extends AudioBufferLike> {
  private entries = new Map<string, Entry<T>>();
  private retainedPrefixes = new Set<string>();
  private clock = 0;
  private used = 0;
  private evicted: string[] = [];

  constructor(private readonly budgetBytes = 96 * 1024 * 1024) {}

  get sizeBytes() { return this.used; }
  get count() { return this.entries.size; }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.touched = ++this.clock;
    return entry.value;
  }

  set(key: string, value: T) {
    const bytes = Math.max(0, value.length * value.numberOfChannels * 4);
    const existing = this.entries.get(key);
    if (existing) this.used -= existing.bytes;
    this.entries.set(key, { value, bytes, touched: ++this.clock });
    this.used += bytes;
    this.evict();
    return value;
  }

  retain(prefixes: string[]) {
    this.retainedPrefixes = new Set(prefixes);
    this.evict();
  }

  takeEvictedKeys() {
    return this.evicted.splice(0);
  }

  deletePrefix(prefix: string) {
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(prefix)) continue;
      this.entries.delete(key);
      this.used -= entry.bytes;
      this.evicted.push(key);
    }
  }

  clear() {
    this.entries.clear();
    this.used = 0;
  }

  private evict() {
    while (this.used > this.budgetBytes) {
      const candidate = [...this.entries.entries()]
        .filter(([key]) => ![...this.retainedPrefixes].some((prefix) => key.startsWith(prefix)))
        .sort((a, b) => a[1].touched - b[1].touched)[0];
      if (!candidate) break;
      const [key, entry] = candidate;
      this.entries.delete(key);
      this.used -= entry.bytes;
      this.evicted.push(key);
    }
  }
}
