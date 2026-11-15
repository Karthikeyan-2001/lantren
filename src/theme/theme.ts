import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'dark' | 'paper' | 'system';
export type ResolvedTheme = 'dark' | 'paper';

const KEY = 'lantern.theme';
const SURFACE: Record<ResolvedTheme, string> = { dark: '#14110F', paper: '#F3E9D8' };

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'dark';
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'paper' || stored === 'system' || stored === 'dark') return stored;
  } catch {
    // storage can be unavailable in private modes; fall through to the default
  }
  return 'dark';
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice);
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SURFACE[resolved]);
  return resolved;
}

/** Theme choice, persisted on the device. Moves into Settings storage in a later phase. */
export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(readThemeChoice);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => applyTheme(readThemeChoice()));

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // not persisted, still applied for this visit
    }
    setResolved(applyTheme(next));
    setChoiceState(next);
  }, []);

  useEffect(() => {
    if (choice !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setResolved(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  return { choice, resolved, setChoice };
}
