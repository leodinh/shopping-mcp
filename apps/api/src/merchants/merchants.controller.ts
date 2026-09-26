import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { listMerchants } from "@shopping-mcp/commerce/merchants";

@Controller("api/merchants")
export class MerchantsController {
  @Get()
  async list(@Res() res: Response) {
    try {
      res.json(await listMerchants());
    } catch (error) {
      console.error("Merchant list failed", error);
      res.status(503).json({ error: "Merchants unavailable. Check database setup." });
    }
  }
}
