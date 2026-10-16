import type { SellerResponse } from "@shopping-mcp/contracts";
import { Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { listStoresForUser } from "@shopping-mcp/commerce/merchants";
import { disconnectStore } from "@shopping-mcp/commerce/store-connection";
import { currentProfile, currentUser } from "./current-user";

/** The seller dashboard: a signed-in User's stores. Every route checks the store is theirs. */
@Controller("api/seller")
export class AuthController {
  @Get()
  async current(@Req() req: Request, @Res() res: Response) {
    try {
      const user = await currentProfile(req.headers);
      if (!user) return res.status(401).json({ error: "Sign in to see your profile." });
      res.json({ user, stores: await listStoresForUser(user.id) } satisfies SellerResponse);
    } catch (error) {
      console.error("Seller dashboard failed", error);
      res.status(503).json({ error: "Store status unavailable." });
    }
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
    res.status(200).json({ ok: true });
  }
}
