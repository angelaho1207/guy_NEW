-- Adds the connect route where two people find each other by both having the
-- connect screen open, rather than by a code or a tap.
--
-- This is its own migration on purpose. A new enum value has to be committed
-- before anything can use it, so putting this in the same file as the presence
-- tables would fail on a fresh database.
alter type public.exchange_method add value if not exists 'nearby';
