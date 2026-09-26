import { drainSyncRuns } from "@shopping-mcp/commerce/sync";

export type DrainFn = typeof drainSyncRuns;

export class OutboxProcessor {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly drain: DrainFn;
  private readonly intervalMs: number;

  constructor(options: { drain?: DrainFn; intervalMs?: number } = {}) {
    this.drain = options.drain ?? drainSyncRuns;
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
      await this.drain({ limit: 1 });
    } catch (error) {
      console.error("Outbox drain failed", error);
    } finally {
      this.running = false;
    }
  }
}
