import { useEffect, useState } from 'react';

import { toLocalDate, type LocalDate } from '../scheduler';

/**
 * Today's local date, kept fresh: re-checked every minute and whenever the app comes
 * back to the foreground, so it rolls over at local midnight and after a timezone change.
 */
export function useToday(): LocalDate {
  const [today, setToday] = useState<LocalDate>(() => toLocalDate(new Date()));
  useEffect(() => {
    const check = () =>
      setToday((prev) => {
        const next = toLocalDate(new Date());
        return next === prev ? prev : next;
      });
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}
