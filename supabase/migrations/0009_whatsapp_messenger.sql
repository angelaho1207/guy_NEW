-- WhatsApp and Messenger, part two: the columns the labels added in 0008 name.
--
-- Both are stored bare, like every other handle, and the tappable link is
-- built at render time in packages/shared/src/handles.ts:
--
--   whatsapp   a phone number  ->  https://wa.me/<digits>
--   messenger  a username      ->  https://m.me/<username>
--
-- Worth knowing about WhatsApp specifically: the thing that makes a wa.me link
-- work is a phone number, so sharing this field shares a phone number. It is
-- its own field rather than a flag on `phone` because the two are not always
-- the same number, and because one can be shared while the other is withheld.

alter table public.profiles add column if not exists whatsapp  text;
alter table public.profiles add column if not exists messenger text;

-- Column level, and additive: this adds to the UPDATE grant written out in
-- 0002 rather than replacing it. A field the owner cannot write is a field
-- that silently refuses to save.
grant update (whatsapp, messenger) on public.profiles to authenticated;

-- Existing profiles have share rows for the 18 fields that existed when they
-- were created. seed_profile_field_shares() only fires on INSERT, so without
-- this, everyone who signed up before today would have no row for the two new
-- fields -- and an absent row is not the same as a row set to false. The whole
-- point of that table is that consent is explicit and never inferred from an
-- absent row, so backfill it.
--
-- They default to shareable, which is what a brand new profile gets for every
-- field. An empty shared field renders as "-", so contacts will see "WhatsApp:
-- -" until someone fills theirs in, exactly as they already do for any other
-- field left blank.
--
-- Written over enum_range rather than naming the two new labels, so re-running
-- it repairs any future gap as well as this one.
insert into public.profile_field_shares (user_id, field)
select p.user_id, f
  from public.profiles p
 cross join unnest(enum_range(null::public.profile_field)) as f
    on conflict (user_id, field) do nothing;
