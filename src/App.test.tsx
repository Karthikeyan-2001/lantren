import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import App from './App';

test('shows the three destinations and the capture button', async () => {
  render(<App />);
  const nav = await screen.findByRole('navigation', { name: 'Main' });
  expect(nav).toHaveTextContent('Today');
  expect(nav).toHaveTextContent('Focus');
  expect(nav).toHaveTextContent('Library');
  expect(screen.getByRole('link', { name: 'Capture what you studied' })).toBeInTheDocument();
});
