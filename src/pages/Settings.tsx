import { useState } from 'react';
import { Link } from 'react-router-dom';

import { DEFAULT_SETTINGS } from '../data/seed';
import { useLantern } from '../data/store';
import type { Settings } from '../data/types';
import { deliveryFor, isClockTime } from '../reminders/plan';
import { enableReminders, reminderPort, requestReminderSync, useReminderStatus } from '../reminders/useReminders';
import { useTheme, type ThemeChoice } from '../theme/theme';
import { Screen } from '../ui/Screen';
import { Button, Choice, TextField, Toggle } from '../ui/controls';

const THEMES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'paper', label: 'Paper' },
  { value: 'system', label: 'System' },
];

const SYSTEM_OFF =
  'Notifications are switched off for Lantern in this device’s settings. Switch them on there and reminders will follow.';

/** Settings, reached from Library. */
export function SettingsPage() {
  const settings = useLantern((s) => s.settings);
  const update = useLantern((s) => s.updateSettings);
  const { choice, setChoice } = useTheme();
  const status = useReminderStatus();
  const [failed, setFailed] = useState(false);
  const [refused, setRefused] = useState(false);

  const attempt = async (work: () => Promise<unknown>) => {
    setFailed(false);
    try {
      await work();
    } catch (error) {
      console.warn('Setting did not save', error);
      setFailed(true);
    }
  };
  const save = (patch: Partial<Omit<Settings, 'id'>>) => attempt(() => update(patch));

  const setReminders = (on: boolean) =>
    attempt(async () => {
      setRefused(false);
      if (!on) return update({ reminders: false });
      const permission = await enableReminders();
      await status.refresh();
      if (permission !== 'granted') setRefused(true);
    });

  const setTime = (value: string) => {
    if (isClockTime(value)) void save({ reminderTime: value });
  };
  const setQuiet = (part: 'start' | 'end', value: string) => {
    if (isClockTime(value) && settings.quietHours) void save({ quietHours: { ...settings.quietHours, [part]: value } });
  };

  const unsupported = status.permission === 'unsupported';
  const blocked = settings.reminders && (status.permission === 'denied' || status.permission === 'prompt');
  const delivery = deliveryFor(settings);

  const reminderNote = unsupported
    ? 'This browser cannot show reminders. They arrive with the Android app.'
    : blocked || refused
      ? SYSTEM_OFF
      : settings.reminders && !status.native
        ? 'In a browser, reminders only arrive while Lantern is open. The Android app delivers them any time.'
        : null;

  return (
    <Screen kicker="settings" title="Settings" lede="A few quiet choices. Everything stays on this device.">
      <Link to="/library" replace className="ln-btn ln-btn--ghost ln-back">
        ← Library
      </Link>

      <section className="ln-section" aria-label="Reminders">
        <hr className="ln-rule" />
        <h2>Reminders</h2>
        <Toggle
          label="Review reminders"
          hint="A gentle nudge on the day a review is due."
          checked={settings.reminders && !unsupported}
          disabled={unsupported}
          onChange={setReminders}
        />
        {reminderNote && (
          <p className="ln-small ln-muted" role="status">
            {reminderNote}
          </p>
        )}

        {settings.reminders && !unsupported && (
          <>
            <TextField
              label="Remind me at"
              type="time"
              value={settings.reminderTime}
              onChange={(e) => setTime(e.target.value)}
              hint={
                delivery.moved
                  ? `That falls in quiet hours, so reminders arrive at ${delivery.time}${delivery.dayShift ? ' the next morning' : ''}, when they end.`
                  : undefined
              }
            />
            <Toggle
              label="One daily digest"
              hint="One line a day, such as “3 reviews waiting, about 12 minutes”, in place of a reminder for each review."
              checked={settings.dailyDigest}
              onChange={(on) => void save({ dailyDigest: on })}
            />
            <Toggle
              label="Quiet hours"
              hint="Nothing arrives during these hours. A reminder that falls inside waits until they end."
              checked={settings.quietHours !== null}
              onChange={(on) => void save({ quietHours: on ? DEFAULT_SETTINGS.quietHours : null })}
            />
            {settings.quietHours && (
              <div className="ln-field__row">
                <TextField
                  label="Quiet from"
                  type="time"
                  value={settings.quietHours.start}
                  onChange={(e) => setQuiet('start', e.target.value)}
                />
                <TextField
                  label="Quiet until"
                  type="time"
                  value={settings.quietHours.end}
                  onChange={(e) => setQuiet('end', e.target.value)}
                />
              </div>
            )}
            {status.exact === 'exact' && <p className="ln-small ln-muted">Reminders arrive on the minute.</p>}
            {status.exact === 'inexact' && (
              <>
                <p className="ln-small ln-muted">
                  Android may deliver reminders a few minutes after the time you chose. You can allow exact timing if
                  you prefer.
                </p>
                <Button
                  onClick={() =>
                    attempt(async () => {
                      await reminderPort.openExactTimingSettings();
                      await status.refresh();
                      await requestReminderSync();
                    })
                  }
                >
                  Allow exact timing
                </Button>
              </>
            )}
          </>
        )}
      </section>

      <section className="ln-section" aria-label="Reviews">
        <hr className="ln-rule" />
        <h2>Reviews</h2>
        <Toggle
          label="Graduation reviews"
          hint="After a topic locks in, look again on day 14 and day 30. Applies to topics that lock in from now on."
          checked={settings.graduationReviews}
          onChange={(on) => void save({ graduationReviews: on })}
        />
      </section>

      {failed && (
        <p className="ln-small ln-muted" role="status">
          That did not save. Try once more.
        </p>
      )}

      <section className="ln-section" aria-label="Appearance">
        <hr className="ln-rule" />
        <h2>Appearance</h2>
        <Choice legend="Theme" options={THEMES} value={choice} onChange={setChoice} />
      </section>
    </Screen>
  );
}
