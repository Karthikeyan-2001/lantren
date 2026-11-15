import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

import { contrastRatio, parseColour } from './contrast';

const css = readFileSync(resolve(process.cwd(), 'src/theme/tokens.css'), 'utf8');

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (m[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

const raw = declarations(/:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '');

function themeVars(theme: string): Record<string, string> {
  const block = new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (!block) throw new Error(`no token block for theme ${theme}`);
  return { ...raw, ...declarations(block) };
}

function colour(vars: Record<string, string>, name: string) {
  let value = vars[name];
  for (let hops = 0; value?.startsWith('var(') && hops < 5; hops++) {
    value = vars[value.slice(4, -1).trim()];
  }
  const rgb = value ? parseColour(value) : null;
  if (!rgb) throw new Error(`cannot resolve ${name}`);
  return rgb;
}

const surfaces = ['--bg', '--surface', '--surface-2'];
const textRoles = ['--text', '--text-muted', '--accent-text', '--moss-text', '--dusk-text'];

for (const theme of ['dark', 'paper']) {
  describe(`${theme} theme contrast`, () => {
    const vars = themeVars(theme);

    for (const t of textRoles) {
      for (const s of surfaces) {
        test(`${t} on ${s} is at least 4.5:1`, () => {
          expect(contrastRatio(colour(vars, t), colour(vars, s))).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    test('text on the accent fill is at least 4.5:1', () => {
      expect(contrastRatio(colour(vars, '--on-accent'), colour(vars, '--accent'))).toBeGreaterThanOrEqual(4.5);
    });
  });
}
