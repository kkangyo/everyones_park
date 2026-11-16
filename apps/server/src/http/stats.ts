import { Router } from "express";
import { API } from "@park/shared";
import type { StatsService } from "../systems/stats";

/** 화면의 '오늘의 공원' (7-3): 오늘 방문자 수와 인기 간식. 누구나 볼 수 있다 */
export function statsRouter(stats: StatsService): Router {
  const router = Router();
  router.get(API.statsToday, async (_req, res) => {
    res.json(await stats.today());
  });
  return router;
}
