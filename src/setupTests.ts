// Adds jest-dom's DOM matchers (toBeInTheDocument, toHaveTextContent, ...) to Vitest's expect.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only cleans up automatically when Vitest globals are enabled.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia, which Ionic uses for platform and dark mode checks.
// Pure-logic tests run in the node environment, where there is no window to patch.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function (query: string): MediaQueryList {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    };
  };
}
