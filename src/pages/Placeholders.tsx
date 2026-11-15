import { Screen } from '../ui/Screen';
import { EmptyState } from '../ui/controls';

/* Warm placeholders until their phases land. */

export function FocusPage() {
  return (
    <Screen kicker="focus" title="One flame, one thing" lede="A single timer and nothing else.">
      <EmptyState title="The timer is being built">
        <p>Focus sessions with a parking lot for stray thoughts and soft rain arrive in phase 5.</p>
      </EmptyState>
    </Screen>
  );
}
