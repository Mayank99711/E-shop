import { useEffect, useState } from "react";

export function useRetryAfterCooldown() {
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const retrySecondsRemaining = Math.max(0, Math.ceil((blockedUntil - clock) / 1000));

  useEffect(() => {
    if (!blockedUntil) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  useEffect(() => {
    if (blockedUntil && retrySecondsRemaining === 0) setBlockedUntil(0);
  }, [blockedUntil, retrySecondsRemaining]);

  function blockOnRateLimit(error) {
    if (error.status !== 429 || !Number.isFinite(error.retryAfter) || error.retryAfter <= 0) return;
    const now = Date.now();
    setClock(now);
    setBlockedUntil(now + error.retryAfter * 1000);
  }

  return { retrySecondsRemaining, blockOnRateLimit };
}
