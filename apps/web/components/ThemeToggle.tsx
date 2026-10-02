'use client';

import { useEffect, useState } from 'react';
import { THEME_NAMES, DEFAULT_THEME, type ThemeName } from '@guy/shared';

/**
 * Switching the ground.
 *
 * The choice lives in `localStorage` and nowhere else. It is a per-device
 * preference about how a screen looks, so putting it in the database would mean
 * a migration, a column, and a round trip, to decide something that does not
 * need to follow anyone between devices.
 *
 * `data-theme` on the document element is what the stylesheet reads. A script
 * in the layout sets it before first paint; this only changes it afterwards.
 */

const STORAGE_KEY = 'guy-theme';

const LABELS: Record<ThemeName, string> = {
  midnight: 'Dark',
  daylight: 'Light',
};

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && (THEME_NAMES as readonly string[]).includes(value);
}

export function ThemeToggle() {
  // Starts undefined rather than guessing, because the server has no idea which
  // theme this browser resolved. Rendering a guess would light the wrong half
  // of the control for a frame.
  const [theme, setTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(isThemeName(current ?? null) ? (current as ThemeName) : DEFAULT_THEME);
  }, []);

  const choose = (next: ThemeName) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing, or site data blocked. The theme still applies for
      // this visit; it just will not be remembered.
    }
  };

  return (
    <div className="card">
      <div className="row-head">
        <div>
          <h3 style={{ margin: 0 }}>Appearance</h3>
          <p className="tiny" style={{ margin: '4px 0 0' }}>
            Remembered on this device. Starts matching your system setting.
          </p>
        </div>
        <div className="btn-row" role="group" aria-label="Appearance">
          {THEME_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className={theme === name ? 'btn btn-primary btn-sm' : 'btn btn-quiet btn-sm'}
              aria-pressed={theme === name}
              onClick={() => choose(name)}
            >
              {LABELS[name]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
