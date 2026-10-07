import type { SellerResponse } from "@shopping-mcp/contracts";
import { Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { getOwnedStore, listStoresForUser } from "@shopping-mcp/commerce/merchants";
import { disconnectStore } from "@shopping-mcp/commerce/store-connection";
import { enqueueSync } from "@shopping-mcp/commerce/sync";
import { currentUser } from "./current-user";

/** The seller dashboard: a signed-in User's stores. Every route checks the store is theirs. */
@Controller("api/seller")
export class AuthController {
  @Get()
  async current(@Req() req: Request, @Res() res: Response) {
    try {
      const user = await currentUser(req.headers);
      const stores = user ? await listStoresForUser(user.id) : [];
      res.json({ user, stores } satisfies SellerResponse);
    } catch (error) {
      console.error("Seller dashboard failed", error);
      res.status(503).json({ error: "Store status unavailable." });
    }
  }

  @Post("stores/:merchantId/sync")
  async sync(
    @Req() req: Request,
    @Res() res: Response,
    @Param("merchantId", ParseUUIDPipe) merchantId: string,
  ) {
    const user = await currentUser(req.headers);
    if (!user) return res.status(401).json({ error: "Sign in to manage your stores." });
    const store = await getOwnedStore(user.id, merchantId);
    if (!store?.connectionId || !store.enabled) {
      return res.status(404).json({ error: "Store not found." });
    }
    await enqueueSync(store.connectionId);
    res.status(202).json({ ok: true });
  }

  @Post("stores/:merchantId/disconnect")
  async disconnect(
    @Req() req: Request,
    @Res() res: Response,
    @Param("merchantId", ParseUUIDPipe) merchantId: string,
  ) {
    const user = await currentUser(req.headers);
    if (!user) return res.status(401).json({ error: "Sign in to manage your stores." });
    if (!(await disconnectStore(user.id, merchantId))) {
      return res.status(404).json({ error: "Store not found." });
    }
    res.json({ ok: true });
  }
}
