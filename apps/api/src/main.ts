import { apiPort, listenHost } from "@shopping-mcp/config";
import { createApi } from "./create-api";

const app = await createApi();
await app.listen(apiPort(), listenHost());
console.log(`API listening on http://${listenHost()}:${apiPort()}`);
