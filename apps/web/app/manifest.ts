import type { MetadataRoute } from 'next';
import { midnight } from '@guy/shared';

/**
 * What makes this installable.
 *
 * Added to the home screen it opens without browser chrome, with its own icon,
 * which is most of what people mean when they say "an app". It is also a
 * prerequisite for web push on iOS, which only reaches home-screen installs.
 *
 * `background_color` is the dark theme's page colour. It is what shows for the
 * instant before the app paints, so a light value here would flash white at
 * someone opening this in a dim room, which is where it gets used.
 *
 * Next generates this at /manifest.webmanifest and links it automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Guy',
    short_name: 'Guy',
    description: 'Swap only what you choose to, with people you actually spoke to.',
    start_url: '/connect',
    display: 'standalone',
    background_color: midnight.colors.background,
    theme_color: midnight.colors.background,
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
