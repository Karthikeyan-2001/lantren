import { useRef, useState, type ChangeEvent } from 'react';

import {
  backupFileName,
  buildBackup,
  countBackup,
  describeCounts,
  parseBackup,
  serializeBackup,
  type Backup,
} from '../data/backup';
import { readBackupFile, saveBackupFile } from '../data/files';
import { useLantern } from '../data/store';
import { shortDate } from '../data/view';
import { toLocalDate } from '../scheduler';
import { Button, TextField } from '../ui/controls';

type Importing =
  | { step: 'idle' }
  | { step: 'refused'; reason: string }
  | { step: 'ready'; backup: Backup }
  | { step: 'busy' }
  | { step: 'done'; words: string }
  | { step: 'failed' };

type Deleting = 'idle' | 'confirm' | 'busy' | 'done' | 'failed';

const WORD = 'delete';
/** A running focus session is kept here; clearing it stops a stale one coming back after a wipe. */
const FOCUS_KEY = 'lantern.focus';

/** When a backup was made, in words; empty if the file did not say. */
function madeOn(backup: Backup): string {
  const made = new Date(backup.exportedAt);
  return made.getTime() > 0 ? `Made ${shortDate(toLocalDate(made))}. ` : '';
}

/** Settings: keep a copy of everything, restore one, or clear the slate. */
export function DataSection() {
  const restore = useLantern((s) => s.restore);
  const wipe = useLantern((s) => s.wipe);

  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [importing, setImporting] = useState<Importing>({ step: 'idle' });
  const [deleting, setDeleting] = useState<Deleting>('idle');
  const [typed, setTyped] = useState('');

  const save = async () => {
    setSaved('idle');
    try {
      const s = useLantern.getState();
      const now = new Date();
      const backup = buildBackup(
        {
          tracks: s.tracks,
          topics: s.topics,
          reviews: s.reviews,
          focusSessions: s.focusSessions,
          settings: s.settings,
        },
        now,
      );
      const result = await saveBackupFile(backupFileName(now), serializeBackup(backup));
      setSaved(result === 'saved' ? 'saved' : 'idle');
    } catch (error) {
      console.warn('Backup did not save', error);
      setSaved('failed');
    }
  };

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clearing the input lets the same file be chosen again after a change of mind.
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseBackup(await readBackupFile(file));
      setImporting(parsed.ok ? { step: 'ready', backup: parsed.backup } : { step: 'refused', reason: parsed.reason });
    } catch (error) {
      console.warn('Backup could not be read', error);
      setImporting({ step: 'refused', reason: 'That file could not be opened.' });
    }
  };

  const confirmRestore = async (backup: Backup) => {
    setImporting({ step: 'busy' });
    try {
      await restore(backup);
      setImporting({ step: 'done', words: describeCounts(countBackup(backup)) });
    } catch (error) {
      console.warn('Backup did not restore', error);
      setImporting({ step: 'failed' });
    }
  };

  const confirmDelete = async () => {
    setDeleting('busy');
    try {
      await wipe();
      try {
        localStorage.removeItem(FOCUS_KEY);
      } catch {
        // Nothing to clear if storage is blocked.
      }
      setTyped('');
      setDeleting('done');
    } catch (error) {
      console.warn('Delete everything did not finish', error);
      setDeleting('failed');
    }
  };

  return (
    <section className="ln-section" aria-label="Your data">
      <hr className="ln-rule" />
      <h2>Your data</h2>
      <p className="ln-small ln-muted">
        Everything lives on this device. A backup is one file you can keep anywhere and restore from later.
      </p>

      <div className="ln-data__buttons">
        <Button onClick={save}>Save a backup</Button>
        <Button onClick={() => fileRef.current?.click()}>Restore from a backup</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Backup file"
          onChange={choose}
        />
      </div>
      {saved === 'saved' && (
        <p className="ln-small ln-muted" role="status">
          Backup saved. Keep it somewhere safe.
        </p>
      )}
      {saved === 'failed' && (
        <p className="ln-small ln-muted" role="status">
          The backup did not save. Try once more.
        </p>
      )}

      {importing.step === 'refused' && (
        <p className="ln-small ln-muted" role="status">
          {importing.reason} Nothing was changed.
        </p>
      )}
      {importing.step === 'failed' && (
        <p className="ln-small ln-muted" role="status">
          The restore did not finish, so nothing was changed. Try once more.
        </p>
      )}
      {importing.step === 'done' && (
        <p className="ln-small ln-muted" role="status">
          Restored {importing.words}.
        </p>
      )}
      {importing.step === 'ready' && (
        <div className="ln-card ln-data__confirm" role="group" aria-label="Restore this backup?">
          <h3>Restore this backup?</h3>
          <p>
            {madeOn(importing.backup)}It holds {describeCounts(countBackup(importing.backup))}. Restoring replaces what
            is on this device now.
          </p>
          <div className="ln-data__buttons">
            <Button variant="ember" onClick={() => void confirmRestore(importing.backup)}>
              Replace with this backup
            </Button>
            <Button variant="ghost" onClick={() => setImporting({ step: 'idle' })}>
              Keep what I have
            </Button>
          </div>
        </div>
      )}
      {importing.step === 'busy' && (
        <p className="ln-small ln-muted" role="status">
          Restoring…
        </p>
      )}

      <hr className="ln-rule" />
      {deleting === 'idle' || deleting === 'done' ? (
        <>
          <Button variant="ghost" onClick={() => setDeleting('confirm')}>
            Delete everything…
          </Button>
          {deleting === 'done' && (
            <p className="ln-small ln-muted" role="status">
              Everything is cleared. Lantern is as it was on the first day.
            </p>
          )}
        </>
      ) : (
        <form
          className="ln-card ln-data__confirm"
          aria-label="Delete everything?"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim().toLowerCase() === WORD && deleting !== 'busy') void confirmDelete();
          }}
        >
          <h3>Delete everything?</h3>
          <p>
            This removes every topic, review, focus session and setting from this device, and it cannot be undone.
            Saving a backup first keeps a way back.
          </p>
          <TextField
            label={`Type “${WORD}” to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
          />
          <div className="ln-data__buttons">
            <Button type="submit" variant="ember" disabled={typed.trim().toLowerCase() !== WORD || deleting === 'busy'}>
              Delete everything
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTyped('');
                setDeleting('idle');
              }}
            >
              Keep my data
            </Button>
          </div>
          {deleting === 'failed' && (
            <p className="ln-small" role="status">
              That did not finish, so nothing was deleted. Try once more.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
