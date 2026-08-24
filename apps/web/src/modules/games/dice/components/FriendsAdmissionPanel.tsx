import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api-client';
import { SecondaryButton } from '../../../../design-system';

interface PendingRequest {
  userId: string;
  requestedAt: string;
}

export function FriendsAdmissionPanel({
  roomCode,
  isHost,
  onAdmissionChange,
}: {
  roomCode: string;
  isHost: boolean;
  onAdmissionChange?: () => void;
}) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isHost || !roomCode) return;
    let cancelled = false;

    const load = async () => {
      try {
        const room = await api.get<{
          id: string;
          metadata?: { pendingJoinRequests?: PendingRequest[] };
        }>(`/api/rooms/${roomCode}`);
        if (cancelled) return;
        setRoomId(room.id);
        setPending(room.metadata?.pendingJoinRequests ?? []);
      } catch {
        if (!cancelled) setPending([]);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isHost, roomCode]);

  if (!isHost || pending.length === 0 || !roomId) return null;

  const resolve = async (userId: string, accept: boolean) => {
    setBusy(userId);
    try {
      await api.post(`/api/dice/rooms/${roomId}/admission/${userId}/${accept ? 'accept' : 'reject'}`, {});
      setPending((prev) => prev.filter((p) => p.userId !== userId));
      onAdmissionChange?.();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dice-friends-admission">
      <h3>Join Requests</h3>
      <ul>
        {pending.map((req) => (
          <li key={req.userId}>
            <span>Player {req.userId.slice(0, 8)}…</span>
            <SecondaryButton loading={busy === req.userId} onClick={() => void resolve(req.userId, true)}>Accept</SecondaryButton>
            <button type="button" className="dice-friends-admission__reject" disabled={busy === req.userId} onClick={() => void resolve(req.userId, false)}>Reject</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
