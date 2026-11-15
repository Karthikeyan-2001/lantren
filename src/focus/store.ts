/**
 * The focus session as the app sees it: which phase it is in, the running timer, and
 * the session that just ended. The rules are in `session.ts`; this only holds state,
 * keeps a running session safe across a restart, and hands finished ones to be saved.
 */
import { create } from 'zustand';

import {
  comeBack,
  finish,
  isKept,
  isOver,
  isValidLength,
  leave,
  park,
  parseStoredRun,
  pause,
  restoreRun,
  resume,
  startRun,
  type FinishedFocus,
  type FocusRun,
} from './session';

export type FocusPhase = 'idle' | 'focus' | 'done' | 'break' | 'breakOver';

export interface FocusDeps {
  now: () => number;
  newId: () => string;
  /** Stores a finished session. Rejects if it could not be written. */
  save: (session: FinishedFocus) => Promise<void>;
  /** Where a running session is kept so it survives the app being closed. */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

export interface FocusState {
  phase: FocusPhase;
  /** The running or paused timer. Set only in the focus phase. */
  run: FocusRun | null;
  /** The session that just ended, for the done card. */
  session: FinishedFocus | null;
  /** True when that session ran its full length. */
  completed: boolean;
  saved: 'saving' | 'saved' | 'failed';
  breakMinutes: number;
  breakEndsAt: number | null;

  begin: (options: { minutes: number; topicId?: string; trackId?: string }) => void;
  pause: () => void;
  resume: () => void;
  /** Stops the session now and keeps what was done. */
  endEarly: () => void;
  park: (thought: string) => void;
  /** The app went out of sight, or came back. */
  leave: () => void;
  comeBack: () => void;
  /** Moves on when a timer has reached zero. Called every second, and on return. */
  tick: () => void;
  startBreak: (minutes: number) => void;
  /** Ends the break early, straight back to the start. */
  skipBreak: () => void;
  /** Back to the start screen. */
  reset: () => void;
  retrySave: () => void;
  /** Picks up a session that was running when the app was last closed. */
  restore: () => void;
}

const STORAGE_KEY = 'lantern.focus';
/** How often a running session's "last seen" time is refreshed in storage. */
const SEEN_EVERY_MS = 15_000;

const RESTING = { run: null, session: null, completed: false, saved: 'saved', breakEndsAt: null } as const;

export function createFocusStore(deps: FocusDeps) {
  let seenAt = 0;

  const persist = (run: FocusRun | null) => {
    try {
      if (run) {
        seenAt = deps.now();
        deps.storage?.setItem(STORAGE_KEY, JSON.stringify({ run, seenAt }));
      } else {
        deps.storage?.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage is full or blocked: the session still runs, it just would not survive a restart.
    }
  };

  return create<FocusState>()((set, get) => {
    const setRun = (run: FocusRun) => {
      if (run === get().run) return;
      set({ run });
      persist(run);
    };

    const save = (session: FinishedFocus) => {
      set({ saved: 'saving' });
      deps.save(session).then(
        () => {
          if (get().session?.id === session.id) set({ saved: 'saved' });
        },
        (error: unknown) => {
          console.warn('Focus session did not save', error);
          if (get().session?.id === session.id) set({ saved: 'failed' });
        },
      );
    };

    const end = (run: FocusRun) => {
      const result = finish(run, deps.now());
      persist(null);
      if (!isKept(result)) {
        set({ phase: 'idle', ...RESTING });
        return;
      }
      set({ phase: 'done', run: null, session: result.session, completed: result.completed, breakEndsAt: null });
      save(result.session);
    };

    return {
      phase: 'idle',
      breakMinutes: 0,
      ...RESTING,

      begin: ({ minutes, topicId, trackId }) => {
        if (get().phase === 'focus' || !isValidLength(minutes)) return;
        const run = startRun(deps.now(), { id: deps.newId(), minutes, topicId, trackId });
        set({ phase: 'focus', ...RESTING, run });
        persist(run);
      },

      pause: () => {
        const { run } = get();
        if (run) setRun(pause(run, deps.now()));
      },

      resume: () => {
        const { run } = get();
        if (run) setRun(resume(run, deps.now()));
      },

      endEarly: () => {
        const { run } = get();
        if (run) end(run);
      },

      park: (thought) => {
        const { run } = get();
        if (run) setRun(park(run, thought));
      },

      leave: () => {
        const { run } = get();
        if (run) setRun(leave(run, deps.now()));
      },

      comeBack: () => {
        const { run } = get();
        if (run) setRun(comeBack(run, deps.now()));
        get().tick();
      },

      tick: () => {
        const { phase, run, breakEndsAt } = get();
        const now = deps.now();
        if (phase === 'focus' && run) {
          if (isOver(run, now)) end(run);
          else if (now - seenAt >= SEEN_EVERY_MS) persist(run);
        } else if (phase === 'break' && breakEndsAt !== null && now >= breakEndsAt) {
          set({ phase: 'breakOver', breakEndsAt: null });
        }
      },

      startBreak: (minutes) => {
        if (get().phase !== 'done' || !(minutes > 0)) return;
        set({ phase: 'break', breakMinutes: minutes, breakEndsAt: deps.now() + minutes * 60_000 });
      },

      skipBreak: () => {
        if (get().phase === 'break') set({ phase: 'idle', ...RESTING });
      },

      reset: () => {
        if (get().phase !== 'focus') set({ phase: 'idle', ...RESTING });
      },

      retrySave: () => {
        const { session, saved } = get();
        if (session && saved === 'failed') save(session);
      },

      restore: () => {
        if (get().phase !== 'idle') return;
        const read = () => {
          try {
            return deps.storage?.getItem(STORAGE_KEY) ?? null;
          } catch {
            // Storage is blocked: there is nothing to pick up.
            return null;
          }
        };
        const stored = parseStoredRun(read());
        if (!stored) return;
        const run = restoreRun(stored, deps.now());
        set({ phase: 'focus', ...RESTING, run });
        persist(run);
        get().tick();
      },
    };
  });
}
