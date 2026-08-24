import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../../lib/api-client';
import './DiceSimulationControls.css';

interface SimRunnerStatus {
  running: boolean;
  stats: {
    roundsCompleted: number;
    roundsSettled: number;
    failedRoundCount: number;
  } | null;
  logs: string[];
  config: { speed: 'normal' | 'fast'; maxRounds: number } | null;
  phase: string | null;
  roundNumber: number | null;
}

export function DiceSimulationControls({
  sessionId,
  roomCode,
  wsConnected,
}: {
  sessionId: string;
  roomCode?: string | null;
  wsConnected?: boolean;
}) {
  const isSimRoom = roomCode === 'DICE10SIM';

  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState<'normal' | 'fast'>('normal');
  const [status, setStatus] = useState<SimRunnerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const lastLogLine = useRef<string | null>(null);
  const prevWs = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (!import.meta.env.DEV || !isSimRoom || wsConnected === undefined) return;
    if (prevWs.current === undefined) {
      prevWs.current = wsConnected;
      return;
    }
    if (prevWs.current !== wsConnected) {
      if (wsConnected) console.log('[SIM] WebSocket reconnect — state resync');
      else console.error('[SIM ERROR] WebSocket disconnected');
      prevWs.current = wsConnected;
    }
  }, [wsConnected, isSimRoom]);

  const pollStatus = useCallback(async () => {
    if (!isSimRoom) return;
    try {
      const data = await api.get<SimRunnerStatus>(`/api/demo/simulation/sessions/${sessionId}/status`);
      setStatus(data);
      setAutoPlay(data.running);
      if (data.config?.speed) setSpeed(data.config.speed);
    } catch {
      // ignore when API unavailable
    }
  }, [sessionId, isSimRoom]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isSimRoom) return;
    void pollStatus();
    const id = setInterval(() => void pollStatus(), 1500);
    return () => clearInterval(id);
  }, [pollStatus, isSimRoom]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isSimRoom || !status?.logs?.length) return;
    const logs = status.logs;
    const start = lastLogLine.current ? logs.lastIndexOf(lastLogLine.current) + 1 : 0;
    for (const line of logs.slice(Math.max(0, start))) {
      if (line.includes('[SIM ERROR]')) console.error(line);
      else console.log(line);
    }
    lastLogLine.current = logs[logs.length - 1] ?? null;
  }, [status?.logs, isSimRoom]);

  if (!import.meta.env.DEV || !isSimRoom) return null;

  const startSim = async () => {
    setBusy(true);
    try {
      await api.post(`/api/demo/simulation/sessions/${sessionId}/start`, {
        speed,
        continuous: true,
        maxRounds: 0,
      });
      setAutoPlay(true);
      await pollStatus();
    } catch (err) {
      console.error('[SIM ERROR]', err);
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stopSim = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ summary?: SimRunnerStatus['stats'] & { logs?: string[] } }>(
        `/api/demo/simulation/sessions/${sessionId}/stop`,
        {},
      );
      setAutoPlay(false);
      if (result.summary) {
        console.log('[SIM] --- STOPPED ---', result.summary);
      }
      await pollStatus();
    } catch (err) {
      console.error('[SIM ERROR]', err);
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoPlay = () => {
    if (autoPlay) void stopSim();
    else void startSim();
  };

  const phaseLabel = status?.phase?.replace(/_/g, ' ') ?? '—';
  const roundNum = status?.roundNumber ?? status?.stats?.roundsCompleted ?? 0;

  return (
    <div className="dice-sim-controls">
      <div className="dice-sim-controls__badge">SIMULATION</div>
      <div className="dice-sim-controls__meta">
        <span>10 PLAYERS</span>
        <span>ROUND: {roundNum}</span>
        <span>STATUS: {phaseLabel}</span>
      </div>
      <div className="dice-sim-controls__actions">
        <button
          type="button"
          className={autoPlay ? 'dice-sim-controls__btn dice-sim-controls__btn--on' : 'dice-sim-controls__btn'}
          disabled={busy}
          onClick={() => void toggleAutoPlay()}
        >
          AUTO PLAY: {autoPlay ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          className="dice-sim-controls__btn dice-sim-controls__btn--stop"
          disabled={busy || !autoPlay}
          onClick={() => void stopSim()}
        >
          STOP
        </button>
        <div className="dice-sim-controls__speed">
          <button
            type="button"
            className={speed === 'normal' ? 'dice-sim-controls__speed-btn dice-sim-controls__speed-btn--active' : 'dice-sim-controls__speed-btn'}
            disabled={busy || autoPlay}
            onClick={() => setSpeed('normal')}
          >
            NORMAL
          </button>
          <button
            type="button"
            className={speed === 'fast' ? 'dice-sim-controls__speed-btn dice-sim-controls__speed-btn--active' : 'dice-sim-controls__speed-btn'}
            disabled={busy || autoPlay}
            onClick={() => setSpeed('fast')}
          >
            FAST
          </button>
        </div>
      </div>
      {status?.stats?.failedRoundCount ? (
        <div className="dice-sim-controls__failures">
          Failed rounds: {status.stats.failedRoundCount}
        </div>
      ) : null}
    </div>
  );
}

export function DiceSimulationLobbyButton({
  onJoin,
  loading,
}: {
  onJoin: () => void;
  loading: boolean;
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <button
      type="button"
      className="dice-sim-lobby-btn"
      disabled={loading}
      onClick={onJoin}
    >
      Join 10 Player Live Test
    </button>
  );
}
