-- Two new shareable fields: WhatsApp and Messenger.
--
-- This file contains nothing but the enum additions, for the same reason 0004
-- does: Postgres will not let a new enum value be USED in the transaction that
-- added it. The columns, grants and backfill that use these labels live in
-- 0009, which runs afterwards.
--
-- `after` places them beside the other social handles rather than at the end
-- of the enum, so the profile form reads in a sensible order. Enum sort order
-- is what enum_range() and every ordered read follow, and the field registry
-- in packages/shared/src/fields.ts has to match it exactly -- a test asserts
-- that, and it understands this placement syntax.

alter type public.profile_field add value if not exists 'whatsapp' after 'instagram';
alter type public.profile_field add value if not exists 'messenger' after 'whatsapp';
