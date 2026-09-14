import { useEffect, useRef } from 'react';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes exactly
const LAST_ACTIVITY_KEY = 'pharmapos_last_user_activity';
const LOGOUT_EVENT_KEY = 'pharmapos_inactivity_logout_broadcast';

interface UseInactivityTimeoutOptions {
  enabled: boolean;
  onTimeout: (reason: string) => void;
}

/**
 * Tracks user activity (mouse, keyboard, touch, clicks, scrolling) across all browser tabs.
 * Triggers onTimeout after exactly 30 minutes of global user inactivity.
 */
export function useInactivityTimeout({ enabled, onTimeout }: UseInactivityTimeoutOptions) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled) return;

    // Initialize last activity timestamp
    const recordActivity = () => {
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      } catch (e) {
        // ignore
      }
    };

    // Set initial timestamp
    recordActivity();

    // Check interval every 15 seconds
    const interval = setInterval(() => {
      try {
        const lastStr = localStorage.getItem(LAST_ACTIVITY_KEY);
        const lastTime = lastStr ? parseInt(lastStr, 10) : Date.now();
        const elapsed = Date.now() - lastTime;

        if (elapsed >= TIMEOUT_MS) {
          // Broadcast to other tabs
          try {
            localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));
          } catch (e) {
            // ignore
          }
          onTimeoutRef.current('You were logged out due to inactivity.');
        }
      } catch (e) {
        // ignore
      }
    }, 15000);

    // Activity listeners (throttled to avoid performance overhead)
    let lastThrottledRecord = 0;
    const handleUserInteraction = () => {
      const now = Date.now();
      if (now - lastThrottledRecord > 3000) {
        lastThrottledRecord = now;
        recordActivity();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });

    // Cross-tab synchronization via storage event
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === LOGOUT_EVENT_KEY && e.newValue) {
        onTimeoutRef.current('You were logged out due to inactivity.');
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      clearInterval(interval);
      events.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction);
      });
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [enabled]);
}
