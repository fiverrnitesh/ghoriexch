import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_EVENTS } from '@games/shared';
import { api } from './api-client';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

export function useRealtimeConnection() {
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    const token = api.getToken();
    if (!token || socketRef.current?.connected) return socketRef.current;

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.debug('[WS] Connected');
    });

    socket.on('disconnect', (reason) => {
      console.debug('[WS] Disconnected:', reason);
    });

    socketRef.current = socket;
    return socket;
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  const joinRoom = useCallback((roomCode: string) => {
    const socket = connect();
    return new Promise<unknown>((resolve, reject) => {
      socket?.emit(REALTIME_EVENTS.ROOM_JOIN, { roomCode }, (response: { success: boolean; error?: string; state?: unknown }) => {
        if (response.success) resolve(response.state);
        else reject(new Error(response.error));
      });
    });
  }, [connect]);

  const joinSession = useCallback((sessionId: string) => {
    const socket = connect();
    return new Promise<unknown>((resolve, reject) => {
      socket?.emit(REALTIME_EVENTS.SESSION_JOIN, { sessionId }, (response: { success: boolean; error?: string; session?: unknown }) => {
        if (response.success) resolve(response.session);
        else reject(new Error(response.error));
      });
    });
  }, [connect]);

  const reconnect = useCallback((payload: { sessionId?: string; roomId?: string }) => {
    connect()?.emit(REALTIME_EVENTS.RECONNECT, payload);
  }, [connect]);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  return { connect, disconnect, joinRoom, joinSession, reconnect, socket: socketRef };
}
