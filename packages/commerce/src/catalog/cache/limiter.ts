/** A slot could not be had before the deadline. */
export class DeadlineExceeded extends Error {
  override readonly name = "TimeoutError";
}

/**
 * Bounds this pod's concurrent provider calls: at most `perKey` to one store and `total` overall.
 * Per pod, not cluster-wide. Waiting for a slot counts against the caller's deadline.
 */
export class Limiter {
  private readonly active = new Map<string, number>();
  private running = 0;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly perKey: number,
    private readonly total: number,
  ) {}

  async run<T>(key: string, deadline: number, task: () => Promise<T>): Promise<T> {
    while (!this.free(key)) {
      const left = deadline - Date.now();
      if (left <= 0) throw new DeadlineExceeded("No free slot before the deadline");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, left);
        function done() {
          clearTimeout(timer);
          resolve();
        }
        this.waiters.push(done);
      });
    }
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    this.running += 1;
    try {
      return await task();
    } finally {
      const count = (this.active.get(key) ?? 1) - 1;
      if (count) this.active.set(key, count);
      else this.active.delete(key);
      this.running -= 1;
      // Everyone waiting rechecks; whoever fits takes the slot.
      const waiting = this.waiters;
      this.waiters = [];
      for (const wake of waiting) wake();
    }
  }

  private free(key: string) {
    return this.running < this.total && (this.active.get(key) ?? 0) < this.perKey;
  }
}
