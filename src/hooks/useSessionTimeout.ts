import { useEffect, useRef } from 'react';

interface UseSessionTimeoutOptions {
  timeoutMs: number;
  warningMs?: number;
  enabled: boolean;
  onTimeout: () => void;
  onWarning?: (msRemaining: number) => void;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousedown','mousemove','keydown','wheel','touchstart','pointerdown','click'];
const ACTIVITY_THROTTLE_MS = 1000;

export function useSessionTimeout({ timeoutMs, warningMs = 60_000, enabled, onTimeout, onWarning }: UseSessionTimeoutOptions) {
  const lastActivityRef = useRef(Date.now());
  const warnedRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const warningRef = useRef<number | null>(null);
  const lastEventRef = useRef(0);
  const onTimeoutRef = useRef(onTimeout);
  const onWarningRef = useRef(onWarning);
  onTimeoutRef.current = onTimeout;
  onWarningRef.current = onWarning;

  useEffect(() => {
    if (!enabled) return;
    lastActivityRef.current = Date.now();
    warnedRef.current = false;

    const clearTimers = () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (warningRef.current !== null) window.clearTimeout(warningRef.current);
      timeoutRef.current = null;
      warningRef.current = null;
    };

    const schedule = () => {
      clearTimers();
      const idleFor = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeoutMs - idleFor);
      if (remaining <= 0) { onTimeoutRef.current(); return; }
      if (warningMs > 0 && remaining > warningMs && onWarningRef.current && !warnedRef.current) {
        warningRef.current = window.setTimeout(() => {
          warnedRef.current = true;
          const remainingAtWarning = Math.max(0, timeoutMs - (Date.now() - lastActivityRef.current));
          onWarningRef.current?.(remainingAtWarning);
        }, remaining - warningMs);
      }
      timeoutRef.current = window.setTimeout(() => {
        const actualIdle = Date.now() - lastActivityRef.current;
        if (actualIdle >= timeoutMs) onTimeoutRef.current(); else schedule();
      }, remaining);
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastEventRef.current < ACTIVITY_THROTTLE_MS) return;
      lastEventRef.current = now;
      lastActivityRef.current = now;
      warnedRef.current = false;
      schedule();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    schedule();
    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, timeoutMs, warningMs]);
}
