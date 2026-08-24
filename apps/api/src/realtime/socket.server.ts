import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { REALTIME_EVENTS } from '@games/shared';
import { env } from '../config/env.js';
import { verifyToken } from '../middleware/auth.js';
import { sessionService } from '../modules/sessions/session.service.js';
import { roomService } from '../modules/rooms/room.service.js';

interface AuthenticatedSocket {
  userId: string;
  email: string;
  roles: string[];
}

const roomConnections = new Map<string, Set<string>>();
const userSockets = new Map<string, Set<string>>();

let realtimeServer: Server | null = null;

export function setRealtimeServer(io: Server) {
  realtimeServer = io;
}

export function getRealtimeServer(): Server | null {
  return realtimeServer;
}

export function emitSessionGameEvent(
  sessionId: string,
  action: string,
  result: { state: Record<string, unknown>; events: unknown[] },
) {
  if (!realtimeServer) return;
  realtimeServer.to(`session:${sessionId}`).emit(REALTIME_EVENTS.GAME_EVENT, {
    sessionId,
    event: action,
    data: { ...result, state: result.state, events: result.events },
    timestamp: new Date().toISOString(),
  });
}

export function createRealtimeServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.api.corsOrigins,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const payload = verifyToken(token);
      (socket.data as { user: AuthenticatedSocket }).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user: AuthenticatedSocket }).user;
    trackUserSocket(user.userId, socket.id);

    socket.on(REALTIME_EVENTS.ROOM_JOIN, async (payload: { roomCode: string }, callback) => {
      try {
        const room = await roomService.getByCode(payload.roomCode);
        socket.join(`room:${room.id}`);
        trackRoomConnection(room.id, socket.id);

        io.to(`room:${room.id}`).emit(REALTIME_EVENTS.ROOM_PLAYER_JOINED, {
          userId: user.userId,
          roomId: room.id,
        });

        const state = await buildRoomState(room.id);
        socket.emit(REALTIME_EVENTS.ROOM_STATE, state);
        callback?.({ success: true, state });
      } catch (err) {
        callback?.({ success: false, error: (err as Error).message });
      }
    });

    socket.on(REALTIME_EVENTS.ROOM_LEAVE, (payload: { roomId: string }) => {
      socket.leave(`room:${payload.roomId}`);
      untrackRoomConnection(payload.roomId, socket.id);
      io.to(`room:${payload.roomId}`).emit(REALTIME_EVENTS.ROOM_PLAYER_LEFT, {
        userId: user.userId,
        roomId: payload.roomId,
      });
    });

    socket.on(REALTIME_EVENTS.SESSION_JOIN, async (payload: { sessionId: string }, callback) => {
      try {
        const session = await sessionService.joinSession(payload.sessionId, user.userId);
        socket.join(`session:${payload.sessionId}`);
        io.to(`session:${payload.sessionId}`).emit(REALTIME_EVENTS.SESSION_STATE, session);
        callback?.({ success: true, session });
      } catch (err) {
        callback?.({ success: false, error: (err as Error).message });
      }
    });

    socket.on(REALTIME_EVENTS.GAME_ACTION, async (
      payload: { sessionId: string; action: string; data: Record<string, unknown> },
      callback,
    ) => {
      try {
        const result = await sessionService.processAction(
          payload.sessionId,
          user.userId,
          payload.action,
          payload.data,
        );

        callback?.({ success: true, ...result });
      } catch (err) {
        callback?.({ success: false, error: (err as Error).message });
      }
    });

    socket.on('disconnect', () => {
      untrackUserSocket(user.userId, socket.id);
      for (const [roomId, sockets] of roomConnections) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          io.to(`room:${roomId}`).emit(REALTIME_EVENTS.ROOM_PLAYER_LEFT, {
            userId: user.userId,
            roomId,
            disconnected: true,
          });
        }
      }
    });

    socket.on(REALTIME_EVENTS.RECONNECT, async (payload: { sessionId?: string; roomId?: string }) => {
      if (payload.sessionId) {
        socket.join(`session:${payload.sessionId}`);
        try {
          const session = await sessionService.getSession(payload.sessionId);
          socket.emit(REALTIME_EVENTS.SESSION_STATE, session);
        } catch { /* session may have ended */ }
      }
      if (payload.roomId) {
        socket.join(`room:${payload.roomId}`);
        try {
          const state = await buildRoomState(payload.roomId);
          socket.emit(REALTIME_EVENTS.ROOM_STATE, state);
        } catch { /* room may have closed */ }
      }
    });
  });

  setRealtimeServer(io);
  return io;
}

function trackUserSocket(userId: string, socketId: string) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId)!.add(socketId);
}

function untrackUserSocket(userId: string, socketId: string) {
  userSockets.get(userId)?.delete(socketId);
}

function trackRoomConnection(roomId: string, socketId: string) {
  if (!roomConnections.has(roomId)) roomConnections.set(roomId, new Set());
  roomConnections.get(roomId)!.add(socketId);
}

function untrackRoomConnection(roomId: string, socketId: string) {
  roomConnections.get(roomId)?.delete(socketId);
}

async function buildRoomState(roomId: string) {
  const { prisma } = await import('../database/client.js');
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      sessions: {
        where: { status: { in: ['WAITING', 'IN_PROGRESS'] } },
        include: {
          players: {
            where: { status: { not: 'LEFT' } },
            include: { user: { select: { id: true, username: true } } },
          },
        },
      },
    },
  });

  if (!room) return null;

  const session = room.sessions[0];
  return {
    roomId: room.id,
    gameId: room.gameId,
    status: room.status,
    sessionId: session?.id ?? null,
    players: session?.players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      seatIndex: p.seatIndex,
      status: p.status,
    })) ?? [],
    metadata: room.metadata as Record<string, unknown>,
  };
}

export function emitGameResult(
  io: Server,
  sessionId: string,
  result: { roundNumber: number; result: Record<string, unknown>; serverSeedHash: string | null },
) {
  io.to(`session:${sessionId}`).emit(REALTIME_EVENTS.GAME_RESULT, {
    sessionId,
    ...result,
    auditRef: sessionId,
    timestamp: new Date().toISOString(),
  });
}

export function emitGameTimer(io: Server, sessionId: string, timer: { phase: string; remainingMs: number }) {
  io.to(`session:${sessionId}`).emit(REALTIME_EVENTS.GAME_TIMER, {
    sessionId,
    ...timer,
    timestamp: new Date().toISOString(),
  });
}
