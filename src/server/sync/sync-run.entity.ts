/** Import attempt queued or finished for a merchant connection. */
export type SyncRun = {
  id: string;
  connectionId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  productCount: number | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};
