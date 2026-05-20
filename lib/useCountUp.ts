import { useRef, useEffect, useState } from 'react';

export function useCountUp(target: number, duration = 650): number {
  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayedRef.current;
    const startTime = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (target - from) * eased);
      displayedRef.current = value;
      setDisplayed(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayedRef.current = target;
        setDisplayed(target);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return displayed;
}
