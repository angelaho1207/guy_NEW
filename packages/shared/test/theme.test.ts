import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors } from '../src/theme.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const css = readFileSync(
  join(repoRoot, 'apps', 'web', 'app', 'globals.css'),
  'utf8',
);

/** Pulls `--name: value;` declarations out of the :root block. */
function cssVars(): Record<string, string> {
  const block = css.slice(css.indexOf(':root'), css.indexOf('}'));
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/** accentSubtle -> accent-subtle */
function kebab(name: string) {
  return name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

// The mobile app reads theme.ts and the web app reads globals.css. Same
// palette, two consumers, so they need a reason not to drift.
const ALIASES: Record<string, string> = {
  background: 'bg',
  textPrimary: 'text-primary',
  textSecondary: 'text-secondary',
  textMuted: 'text-muted',
  surfaceRaised: 'surface-raised',
  accentPressed: 'accent-pressed',
  accentSubtle: 'accent-subtle',
  onAccent: 'on-accent',
};

describe('the palette', () => {
  const vars = cssVars();

  for (const [name, value] of Object.entries(colors)) {
    test(`${name} matches the web stylesheet`, () => {
      const cssName = ALIASES[name] ?? kebab(name);
      assert.ok(
        vars[cssName] !== undefined,
        `globals.css has no --${cssName}; the web app and theme.ts disagree`,
      );
      assert.equal(
        vars[cssName].toLowerCase(),
        value.toLowerCase(),
        `--${cssName} and colors.${name} must be the same colour`,
      );
    });
  }

  test('the accent is a deep muted burgundy, not a bright red', () => {
    // The brief is explicit about this one, so it is worth a guard rather than
    // a comment. A bright red would be high in red and low in the others; a
    // muted burgundy is darker overall and not fully saturated.
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(colors.accent.slice(i, i + 2), 16),
    );
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = (max - min) / max;

    assert.ok(max < 200, 'the accent must not be a bright red or pink');
    assert.ok(saturation < 0.85, 'the accent must stay muted');
    assert.equal(max, r, 'the accent is a red, so red is its strongest channel');
  });
});
