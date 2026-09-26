import type { IncomingMessage, ServerResponse } from "node:http";

export async function toFetchRequest(req: IncomingMessage): Promise<Request> {
  const protocol = "http";
  const host = req.headers.host ?? "127.0.0.1";
  const url = `${protocol}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
  return new Request(url, { method, headers, body });
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  const raw = (req as IncomingMessage & { rawBody?: Buffer }).rawBody;
  if (raw) return Promise.resolve(raw);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function sendFetchResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      const current = res.getHeader("set-cookie");
      const next = current
        ? Array.isArray(current)
          ? [...current, value]
          : [String(current), value]
        : [value];
      res.setHeader("set-cookie", next);
      return;
    }
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}
