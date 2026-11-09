import { Router } from "express";

const startedAt = Date.now();

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true, uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
});
