import { useCallback, useEffect, useRef, useState } from 'react';

/** Copy a string to the clipboard and report `copied` for a moment after. */
export function useCopy(resetMs = 1600): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    (text: string) => {
      const done = () => {
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), resetMs);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        done();
      }
    },
    [resetMs],
  );

  return { copied, copy };
}
