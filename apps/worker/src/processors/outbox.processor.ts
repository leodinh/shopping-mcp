import { drainSyncRuns, enqueueDueSyncs } from "@shopping-mcp/commerce/sync";

export type DrainFn = typeof drainSyncRuns;
export type EnqueueDueFn = typeof enqueueDueSyncs;

export class OutboxProcessor {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly drain: DrainFn;
  private readonly enqueueDue: EnqueueDueFn;
  private readonly intervalMs: number;

  constructor(options: { drain?: DrainFn; enqueueDue?: EnqueueDueFn; intervalMs?: number } = {}) {
    this.drain = options.drain ?? drainSyncRuns;
    this.enqueueDue = options.enqueueDue ?? enqueueDueSyncs;
    this.intervalMs = options.intervalMs ?? 10_000;
  }

  start() {
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.enqueueDue();
      await this.drain({ limit: 1 });
    } catch (error) {
      console.error("Outbox drain failed", error);
    } finally {
      this.running = false;
    }
  }
}
