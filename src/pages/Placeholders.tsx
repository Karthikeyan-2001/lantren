import { Link } from 'react-router-dom';

import { Screen } from '../ui/Screen';
import { EmptyState } from '../ui/controls';

/* These screens are warm placeholders until their phases land. */

export function TodayPage() {
  return (
    <Screen
      kicker="today"
      title="Nothing waiting yet"
      lede="A quiet desk. Reviews will gather here on day 4 and day 7."
    >
      <EmptyState title="Light your first lantern">
        <p>Capture something you studied today. Two small flames will be set for it, and I will remind you.</p>
        <Link to="/capture" className="ln-btn ln-btn--ember">
          Capture a topic
        </Link>
      </EmptyState>
    </Screen>
  );
}

export function FocusPage() {
  return (
    <Screen kicker="focus" title="One flame, one thing" lede="A single timer and nothing else.">
      <EmptyState title="The timer is being built">
        <p>Focus sessions with a parking lot for stray thoughts and soft rain arrive in phase 5.</p>
      </EmptyState>
    </Screen>
  );
}

export function LibraryPage() {
  return (
    <Screen kicker="library" title="Your lanterns" lede="Every topic you have studied, by track.">
      <EmptyState title="The shelf is empty, for now">
        <p>Topics you capture will rest here. Tracks, progress and settings will live here too.</p>
      </EmptyState>
      <Link to="/styleguide" className="ln-btn ln-btn--quiet ln-btn--block">
        Open the style guide
      </Link>
    </Screen>
  );
}

export function CapturePage() {
  return (
    <Screen kicker="capture" title="What did you study?" lede="Under ten seconds, then back to your day.">
      <EmptyState title="Capture arrives in phase 2">
        <p>Title, track, a few notes, how confident you feel. Saving will set the day 4 and day 7 flames.</p>
        <Link to="/today" className="ln-btn ln-btn--quiet">
          Back to today
        </Link>
      </EmptyState>
    </Screen>
  );
}
