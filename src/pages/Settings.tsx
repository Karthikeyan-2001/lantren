import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useLantern } from '../data/store';
import { useTheme, type ThemeChoice } from '../theme/theme';
import { Screen } from '../ui/Screen';
import { Choice, Toggle } from '../ui/controls';

const THEMES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'paper', label: 'Paper' },
  { value: 'system', label: 'System' },
];

/** Settings, reached from Library. Grows with later phases (reminders in P4). */
export function SettingsPage() {
  const graduation = useLantern((s) => s.settings.graduationReviews);
  const update = useLantern((s) => s.updateSettings);
  const { choice, setChoice } = useTheme();
  const [failed, setFailed] = useState(false);

  const setGraduation = async (on: boolean) => {
    setFailed(false);
    try {
      await update({ graduationReviews: on });
    } catch (error) {
      console.warn('Setting did not save', error);
      setFailed(true);
    }
  };

  return (
    <Screen kicker="settings" title="Settings" lede="A few quiet choices. Everything stays on this device.">
      <Link to="/library" replace className="ln-btn ln-btn--ghost ln-back">
        ← Library
      </Link>

      <section className="ln-section" aria-label="Reviews">
        <hr className="ln-rule" />
        <h2>Reviews</h2>
        <Toggle
          label="Graduation reviews"
          hint="After a topic locks in, look again on day 14 and day 30. Applies to topics that lock in from now on."
          checked={graduation}
          onChange={setGraduation}
        />
        {failed && (
          <p className="ln-small ln-muted" role="status">
            That did not save. Try once more.
          </p>
        )}
      </section>

      <section className="ln-section" aria-label="Appearance">
        <hr className="ln-rule" />
        <h2>Appearance</h2>
        <Choice legend="Theme" options={THEMES} value={choice} onChange={setChoice} />
      </section>
    </Screen>
  );
}
