import { api } from '../../../../lib/api-client';

/** Dev-only: open DICEDEMO session and fill 4 extra humans (+ caller + TIGER = 6 visual seats). */
export async function openSixPlayerDemoRoom(): Promise<string> {
  const room = await api.post<{ sessionId: string; session: { id: string } }>('/api/demo/room', {});
  const sessionId = room.sessionId ?? room.session.id;
  await api.post(`/api/demo/sessions/${sessionId}/fill`, { preset: '6' });
  return sessionId;
}
