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

  test('Discord is not tappable while Q3 is open', () => {
    // A Discord username alone cannot be resolved to a profile URL. Returning
    // null forces the UI to render plain text rather than a link that 404s.
    assert.equal(linkFor('discord', 'angela'), null);
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
