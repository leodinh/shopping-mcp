import { authorizeCron } from "@/server/sync/cron-auth";
import { drainSyncRuns } from "@/server/sync/outbox";

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

async function run(request: Request) {
  if (!authorizeCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await drainSyncRuns({ limit: 1 });
  return Response.json({ processed: results.length, results });
}
