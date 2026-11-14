import { matchMaker } from "@colyseus/core";
import { Router } from "express";
import { API, ROOM_NAME, type ChannelInfo, type ChannelListResponse } from "@park/shared";
import type { ParkRoomMetadata } from "../rooms/ParkRoom";

/** 채널 목록 (6-4): 채널마다 접속자 수. 화면의 채널 목록에서 다른 채널로 옮길 때 쓴다 */
export const channelsRouter = Router();

channelsRouter.get(API.channels, async (_req, res) => {
  const rooms = await matchMaker.query<any>({ name: ROOM_NAME });
  const channels: ChannelInfo[] = rooms
    .map((room) => ({
      id: room.roomId,
      channel: (room.metadata as ParkRoomMetadata | undefined)?.channel ?? 0,
      players: room.clients,
      max: room.maxClients,
    }))
    .sort((a, b) => a.channel - b.channel);
  res.json({ channels } satisfies ChannelListResponse);
});
