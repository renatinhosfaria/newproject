export class ManualSseScheduler {
  private time = 0;
  private tasks = new Set<{
    ms: number;
    due: number;
    callback: () => Promise<void>;
  }>();
  every(ms: number, callback: () => Promise<void>): () => void {
    const task = { ms, due: this.time + ms, callback };
    this.tasks.add(task);
    return () => {
      this.tasks.delete(task);
    };
  }
  async fire(ms: number): Promise<void> {
    for (const task of [...this.tasks].filter((t) => t.ms === ms))
      await task.callback();
  }
  get size() {
    return this.tasks.size;
  }
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    while (true) {
      const next = [...this.tasks]
        .filter((task) => task.due <= target)
        .sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      this.time = next.due;
      next.due += next.ms;
      await next.callback();
    }
    this.time = target;
  }
}
