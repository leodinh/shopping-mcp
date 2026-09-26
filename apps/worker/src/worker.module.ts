import { Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { OutboxProcessor } from "./processors/outbox.processor";

@Module({})
export class WorkerModule implements OnModuleInit, OnModuleDestroy {
  private readonly processor = new OutboxProcessor();

  onModuleInit() {
    this.processor.start();
  }

  onModuleDestroy() {
    this.processor.stop();
  }
}
