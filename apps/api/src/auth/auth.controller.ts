import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { destroySession, enqueueSync, getDashboardMerchant } from "@shopping-mcp/application";

@Controller("api/seller")
export class AuthController {
  @Get()
  async current(@Req() req: Request, @Res() res: Response) {
    try {
      const merchant = await getDashboardMerchant(req.headers.cookie ?? null);
      res.json({
        merchant: merchant
          ? { ...merchant, lastSyncedAt: merchant.lastSyncedAt?.toISOString() ?? null }
          : null,
      });
    } catch (error) {
      console.error("Seller dashboard failed", error);
      res.status(503).json({ error: "Store status unavailable." });
    }
  }

  @Post("sync")
  async sync(@Req() req: Request, @Res() res: Response) {
    try {
      const merchant = await getDashboardMerchant(req.headers.cookie ?? null);
      if (merchant?.connectionId) await enqueueSync(merchant.connectionId);
    } catch {
      // Surface stays on /seller; board shows lastError / status.
    }
    res.json({ ok: true });
  }

  @Post("disconnect")
  async disconnect(@Req() req: Request, @Res() res: Response) {
    const setCookie = await destroySession(req.headers.cookie ?? null);
    res.setHeader("Set-Cookie", setCookie);
    res.json({ ok: true });
  }
}
