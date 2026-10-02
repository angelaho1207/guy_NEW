import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  themes,
  midnight,
  daylight,
  colors,
  avatarGradient,
  AVATAR_GRADIENTS,
  type ThemeColors,
} from '../src/theme.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const css = readFileSync(
  join(repoRoot, 'apps', 'web', 'app', 'globals.css'),
  'utf8',
);

/** The `--name: value;` declarations inside one selector's block. */
function cssVars(selector: string): Record<string, string> {
  const at = css.indexOf(selector + ' {');
  assert.notEqual(at, -1, `globals.css has no "${selector} {" block`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  const block = css.slice(open, close);

  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    out[name] = value.trim().replace(/\s+/g, ' ');
  }
  return out;
}

/** accentSubtle -> accent-subtle. Only `background` needs an exception. */
function cssName(token: string): string {
  if (token === 'background') return 'bg';
  return token.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/**
 * The two themes, each paired with the selector that carries it. The mobile app
 * reads theme.ts and the web app reads globals.css, so they need a reason not
 * to drift.
 */
const PAIRS: [string, typeof midnight, string][] = [
  ['midnight', midnight, ':root,\n:root[data-theme=\'midnight\']'],
  ['daylight', daylight, ':root[data-theme=\'daylight\']'],
];

// --- contrast ---------------------------------------------------------------

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(m, `${hex} is not a six digit hex colour`);
  const n = parseInt(m![1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The hex stops inside a `linear-gradient(...)` value. */
function stops(gradient: string): string[] {
  return [...gradient.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
}

// ---------------------------------------------------------------------------

describe('the palette', () => {
  for (const [name, theme, selector] of PAIRS) {
    describe(name, () => {
      const vars = cssVars(selector);

      for (const [token, value] of Object.entries(theme.colors)) {
        test(`${token} matches the web stylesheet`, () => {
          const key = cssName(token);
          assert.ok(
            vars[key] !== undefined,
            `the ${name} block has no --${key}; theme.ts and globals.css disagree`,
          );
          assert.equal(
            vars[key].toLowerCase(),
            value.toLowerCase().replace(/\s+/g, ' '),
            `--${key} and ${name}.colors.${token} must be the same value`,
          );
        });
      }

      test('the stylesheet declares no token theme.ts does not', () => {
        // Catches the other direction: a colour added to the CSS and forgotten
        // in theme.ts would leave the mobile app unable to render it.
        const known = new Set(Object.keys(theme.colors).map(cssName));
        const extra = Object.keys(vars).filter((v) => !known.has(v));
        assert.deepEqual(extra, [], `--${extra.join(', --')} is not in theme.ts`);
      });
    });
  }

  test('both themes carry exactly the same tokens', () => {
    // A token present in one theme and missing from the other is a component
    // that renders correctly on one ground and breaks on the other.
    assert.deepEqual(
      Object.keys(midnight.colors).sort(),
      Object.keys(daylight.colors).sort(),
    );
  });

  test('colors still points at the dark theme, for the mobile app', () => {
    assert.equal(colors, midnight.colors);
  });
});

describe('the accent is contrast, not colour', () => {
  // The rule the whole palette rests on. An accent that drifts towards a hue
  // turns every button into a decoration, and on this app a decorated Confirm
  // button is a trust problem rather than a style one.
  for (const [name, theme] of PAIRS) {
    test(`${name}: the accent is near-neutral`, () => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(theme.colors.accent);
      assert.ok(m, 'the accent must be a six digit hex colour');
      const [r, g, b] = m!.slice(1).map((h) => parseInt(h, 16));
      const max = Math.max(r, g, b);
      const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
      assert.ok(
        saturation < 0.1,
        `the accent is ${Math.round(saturation * 100)}% saturated; it must read as neutral`,
      );
    });

    test(`${name}: the accent is maximally separated from the ground`, () => {
      assert.ok(
        contrast(theme.colors.accent, theme.colors.background) > 12,
        'a primary action must be unmistakable against the page',
      );
    });
  }
});

describe('text clears WCAG AA on its own ground', () => {
  // Neon on near-black and grey on white both fail easily, and one of these
  // colours renders the shared-but-empty "-", which is load bearing: it has to
  // be readable or the difference between "blank" and "withheld" disappears.
  const onBackground: (keyof ThemeColors)[] = [
    'textPrimary',
    'textSecondary',
    'textMuted',
    'danger',
    'success',
    // The semantic pill inks. These are the dangerous ones: amber and green
    // read fine on near-black and fail outright on white unless darkened well
    // past where they look right in isolation.
    'warnInk',
    'goInk',
    'link',
  ];

  for (const [name, theme] of PAIRS) {
    for (const token of onBackground) {
      test(`${name}: ${token} on the background`, () => {
        const ratio = contrast(theme.colors[token], theme.colors.background);
        assert.ok(
          ratio >= 4.5,
          `${token} is ${ratio.toFixed(2)}:1 against the background, needs 4.5:1`,
        );
      });
    }

    test(`${name}: text on an accent fill`, () => {
      const ratio = contrast(theme.colors.onAccent, theme.colors.accent);
      assert.ok(ratio >= 4.5, `onAccent is ${ratio.toFixed(2)}:1 on the accent`);
    });

    // Every gradient carries ink, and a gradient's worst stop is what decides
    // whether that ink can be read. Initials on an avatar are small text on a
    // pastel, which is exactly where this goes wrong quietly.
    const inked: [keyof ThemeColors, keyof ThemeColors][] = [
      ['celebrate', 'celebrateInk'],
      ['gradBloom', 'gradBloomInk'],
      ['gradPeriwinkle', 'gradPeriwinkleInk'],
      ['gradDusk', 'gradDuskInk'],
    ];

    test(`${name}: hero ink against the top of the wash`, () => {
      // Checked against the FIRST stop, not the darkest one, because the wash's
      // last stop is the page background by design -- it fades out. The
      // headline sits in the top third, which is the only place this ink is
      // readable, and .hero's padding is what keeps it there.
      const first = stops(theme.colors.heroWash)[0];
      const ratio = contrast(theme.colors.heroInk, first);
      assert.ok(
        ratio >= 4.5,
        `heroInk is ${ratio.toFixed(2)}:1 on the wash's first stop`,
      );
    });

    test(`${name}: the wash ends at the page background`, () => {
      // What makes it a wash rather than a band. If this ever drifts, the hero
      // gains a hard horizontal edge across the page.
      const last = stops(theme.colors.heroWash).at(-1);
      assert.equal(
        last?.toLowerCase(),
        theme.colors.background.toLowerCase(),
        'the final stop must be the background of this same theme',
      );
    });

    test(`${name}: the wash is wider than the pill gradient`, () => {
      // The bug this exists to prevent: painting `celebrate` over a few hundred
      // pixels, where its two close stops read as a flat slab rather than a
      // gradient. The wash needs three stops to do its job.
      assert.ok(
        stops(theme.colors.heroWash).length >= 3,
        'heroWash needs at least three stops to read as a gradient at size',
      );
    });

    for (const [gradient, ink] of inked) {
      test(`${name}: ${ink} on ${gradient}, at its darkest stop`, () => {
        const worst = stops(theme.colors[gradient])
          .map((stop) => contrast(theme.colors[ink], stop))
          .sort((a, b) => a - b)[0];
        assert.ok(
          worst >= 4.5,
          `${ink} is ${worst.toFixed(2)}:1 on ${gradient}'s darkest stop`,
        );
      });
    }
  }
});

describe('the gradient is decoration', () => {
  test('it is a gradient in both themes, not a flat colour', () => {
    for (const [name, theme] of PAIRS) {
      assert.match(
        theme.colors.celebrate,
        /^linear-gradient\(/,
        `${name}.celebrate must be a gradient`,
      );
      assert.ok(
        stops(theme.colors.celebrate).length >= 2,
        `${name}.celebrate needs at least two stops`,
      );
    }
  });

  test('its ink is dark in both themes, because the gradient is light in both', () => {
    for (const [name, theme] of PAIRS) {
      assert.ok(
        luminance(theme.colors.celebrateInk) < 0.2,
        `${name}.celebrateInk must be dark enough to sit on a pastel`,
      );
    }
  });

  test('a QR code gets a light quiet zone whichever theme is on', () => {
    // Not a style choice: a scanner needs a light field around the pattern, so
    // this pair does not flip with the theme the way everything else does.
    for (const [name, theme] of PAIRS) {
      assert.ok(
        luminance(theme.colors.qrPaper) > 0.8,
        `${name}.qrPaper must stay light or codes stop scanning`,
      );
      assert.ok(
        contrast(theme.colors.qrInk, theme.colors.qrPaper) >= 4.5,
        `${name}.qrInk must be readable on the quiet zone`,
      );
    }
  });
});

describe('every theme is reachable', () => {
  test('themes holds both, keyed by name', () => {
    assert.deepEqual(Object.keys(themes).sort(), ['daylight', 'midnight']);
    for (const [key, theme] of Object.entries(themes)) {
      assert.equal(theme.name, key, 'a theme knows its own key');
    }
  });

  test('the stylesheet has a block for each theme name', () => {
    for (const name of Object.keys(themes)) {
      assert.ok(
        css.includes(`[data-theme='${name}']`),
        `globals.css has no [data-theme='${name}'] block, so the toggle cannot reach it`,
      );
    }
  });
});

describe('avatar gradients', () => {
  test('there is a token pair for every gradient in the list', () => {
    // The list and the tokens are two copies of the same knowledge, and a
    // mismatch is an avatar rendered with no background at all.
    for (const which of AVATAR_GRADIENTS) {
      const key = `grad${which[0].toUpperCase()}${which.slice(1)}` as keyof ThemeColors;
      for (const [name, theme] of PAIRS) {
        assert.ok(theme.colors[key], `${name} has no ${key}`);
        assert.ok(theme.colors[`${key}Ink` as keyof ThemeColors], `${name} has no ${key}Ink`);
      }
    }
  });

  test('the same person always gets the same gradient', () => {
    const id = '12382552-2750-466d-a76a-f8143cc8c07c';
    assert.equal(avatarGradient(id), avatarGradient(id));
  });

  test('it only ever returns one of the three', () => {
    for (let i = 0; i < 200; i += 1) {
      assert.ok(
        (AVATAR_GRADIENTS as readonly string[]).includes(avatarGradient(`user-${i}`)),
      );
    }
  });

  test('it spreads across all three rather than favouring one', () => {
    // Not a distribution guarantee, just a guard against a hash that collapses:
    // every avatar coming out the same colour would look deliberate and be a bug.
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) seen.add(avatarGradient(`user-${i}`));
    assert.equal(seen.size, AVATAR_GRADIENTS.length);
  });

  test('a missing or blank id still gets a gradient', () => {
    // Better a predictable colour than an avatar with no background.
    for (const seed of [null, undefined, '', '   ']) {
      assert.ok((AVATAR_GRADIENTS as readonly string[]).includes(avatarGradient(seed)));
    }
  });
});
