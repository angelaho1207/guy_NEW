import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, linkFor, displayHandle } from '../src/handles.ts';

describe('normalising what the user typed', () => {
  test('strips a leading @', () => {
    assert.equal(normalizeHandle('instagram', '@angela'), 'angela');
  });

  test('accepts a pasted profile URL', () => {
    assert.equal(
      normalizeHandle('linkedin', 'https://www.linkedin.com/in/angela-ho'),
      'angela-ho',
    );
    assert.equal(normalizeHandle('instagram', 'instagram.com/angela'), 'angela');
  });

  test('accepts an x.com or twitter.com URL', () => {
    assert.equal(normalizeHandle('x', 'https://twitter.com/angela'), 'angela');
    assert.equal(normalizeHandle('x', 'https://x.com/angela'), 'angela');
  });

  test('drops a trailing slash, query or fragment', () => {
    assert.equal(
      normalizeHandle('linkedin', 'linkedin.com/in/angela-ho/?originalSubdomain=uk'),
      'angela-ho',
    );
  });

  test('keeps the plus on a phone number and drops the formatting', () => {
    assert.equal(normalizeHandle('phone', '+1 (555) 010-0123'), '+15550100123');
    assert.equal(normalizeHandle('phone', '555.010.0123'), '5550100123');
  });

  test('lowercases an email and strips a mailto prefix', () => {
    assert.equal(
      normalizeHandle('work_email', 'mailto:Angela@Example.COM'),
      'angela@example.com',
    );
  });

  test('empty stays empty', () => {
    assert.equal(normalizeHandle('x', '   '), '');
  });
});

describe('building the tappable link', () => {
  test('LinkedIn, X and Instagram construct a profile URL', () => {
    assert.equal(linkFor('linkedin', 'angela-ho'), 'https://www.linkedin.com/in/angela-ho');
    assert.equal(linkFor('x', '@angela'), 'https://x.com/angela');
    assert.equal(linkFor('instagram', 'angela'), 'https://instagram.com/angela');
  });

  test('a phone number opens the dialer', () => {
    assert.equal(linkFor('phone', '+1 555 010 0123'), 'tel:+15550100123');
  });

  test('an email opens the mail client', () => {
    assert.equal(linkFor('personal_email', 'Angela@example.com'), 'mailto:angela@example.com');
    assert.equal(linkFor('work_email', 'a@b.co'), 'mailto:a@b.co');
  });

  test('Discord links through the numeric id', () => {
    assert.equal(
      linkFor('discord', 'angela', '123456789012345678'),
      'https://discord.com/users/123456789012345678',
    );
  });

  test('Discord without an id is plain text, not a broken link', () => {
    // A username alone cannot be resolved to a profile URL. Returning null
    // forces the UI to render text rather than a link that goes nowhere.
    assert.equal(linkFor('discord', 'angela'), null);
    assert.equal(linkFor('discord', 'angela', null), null);
    assert.equal(linkFor('discord', 'angela', ''), null);
  });

  test('a malformed Discord id is refused rather than linked', () => {
    assert.equal(linkFor('discord', 'angela', 'not-an-id'), null);
    assert.equal(linkFor('discord', 'angela', '123'), null);
    assert.equal(
      linkFor('discord', 'angela', '12345678901234567890123456789'),
      null,
      'too long to be a snowflake',
    );
  });

  test('a Discord id with stray whitespace still links', () => {
    assert.equal(
      linkFor('discord', 'angela', '  123456789012345678  '),
      'https://discord.com/users/123456789012345678',
    );
  });

  test('an empty handle has no link', () => {
    assert.equal(linkFor('instagram', ''), null);
    assert.equal(linkFor('phone', '   '), null);
  });

  test('a handle with URL-unsafe characters is escaped, not injected', () => {
    const link = linkFor('instagram', 'a b&c');
    assert.equal(link, 'https://instagram.com/a%20b%26c');
  });
});

describe('displaying the handle', () => {
  test('social handles read with an @', () => {
    assert.equal(displayHandle('x', 'angela'), '@angela');
    assert.equal(displayHandle('discord', '@angela'), '@angela');
  });

  test('phone and email read as themselves', () => {
    assert.equal(displayHandle('work_email', 'A@b.co'), 'a@b.co');
    assert.equal(displayHandle('phone', '+1 555 010 0123'), '+15550100123');
  });
});

describe('WhatsApp and Messenger', () => {
  test('a WhatsApp number becomes a wa.me chat link', () => {
    assert.equal(linkFor('whatsapp', '+1 650 555 0142'), 'https://wa.me/16505550142');
  });

  test('a pasted wa.me link reduces to the number it contained', () => {
    assert.equal(normalizeHandle('whatsapp', 'https://wa.me/16505550142'), '+16505550142');
    assert.equal(
      normalizeHandle('whatsapp', 'https://api.whatsapp.com/send?phone=16505550142'),
      '+16505550142',
    );
  });

  test('a number too short to carry a country code is not linked', () => {
    // wa.me resolves digits as an international number. Guessing a country
    // code would send someone to a stranger, so this renders as plain text.
    assert.equal(linkFor('whatsapp', '555 0142'), null);
    assert.equal(displayHandle('whatsapp', '555 0142'), '5550142');
  });

  test('a Messenger username becomes an m.me link', () => {
    assert.equal(linkFor('messenger', 'angela.ho'), 'https://m.me/angela.ho');
    assert.equal(displayHandle('messenger', 'angela.ho'), '@angela.ho');
  });

  test('a pasted Messenger or Facebook URL reduces to the username', () => {
    for (const pasted of [
      'https://m.me/angela.ho',
      'm.me/angela.ho',
      'https://www.messenger.com/t/angela.ho',
      'https://www.facebook.com/angela.ho',
      'https://www.facebook.com/messages/t/angela.ho',
      '@angela.ho',
    ]) {
      assert.equal(normalizeHandle('messenger', pasted), 'angela.ho', pasted);
    }
  });

  test('a Messenger handle with URL-unsafe characters is escaped', () => {
    assert.equal(linkFor('messenger', 'a b&c'), 'https://m.me/a%20b%26c');
  });

  test('an empty value has no link', () => {
    assert.equal(linkFor('whatsapp', '  '), null);
    assert.equal(linkFor('messenger', ''), null);
  });
});

describe('LinkedIn, where the slug is not guessable', () => {
  // LinkedIn appends random characters when the obvious slug is taken, so
  // angela-ho and angela-ho-4289992b2 are different people. The form asks for
  // the URL; these are the shapes it arrives in.
  const slug = 'angela-ho-4289992b2';

  test('a pasted profile URL keeps the whole slug, suffix and all', () => {
    for (const pasted of [
      `https://www.linkedin.com/in/${slug}`,
      `https://linkedin.com/in/${slug}`,
      `www.linkedin.com/in/${slug}`,
      `linkedin.com/in/${slug}/`,
      `https://uk.linkedin.com/in/${slug}`,
      `https://m.linkedin.com/in/${slug}?trk=nav`,
    ]) {
      assert.equal(normalizeHandle('linkedin', pasted), slug, pasted);
    }
  });

  test('the link rebuilds the address that was pasted in', () => {
    assert.equal(
      linkFor('linkedin', `https://uk.linkedin.com/in/${slug}`),
      `https://www.linkedin.com/in/${slug}`,
    );
  });

  test('it reads as a path, not as an @ handle', () => {
    assert.equal(displayHandle('linkedin', `https://www.linkedin.com/in/${slug}`),
      `linkedin.com/in/${slug}`);
  });
});
