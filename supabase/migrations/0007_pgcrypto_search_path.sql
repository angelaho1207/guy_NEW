-- Let mint_connect_token() find `gen_random_bytes`.
--
-- Supabase installs `pgcrypto` into a schema called `extensions`, not into
-- `public`. Every function here pins `search_path = public`, which is the
-- right thing to do: an unpinned search_path on a SECURITY DEFINER function is
-- how those get hijacked. But it also means the extension schema is invisible,
-- so `gen_random_bytes` could not be resolved and minting a connect code failed
-- at runtime with "function gen_random_bytes(integer) does not exist".
--
-- This never showed up in testing because a bare Postgres installs pgcrypto
-- into `public`, where the pinned path finds it. The test harness now puts it
-- in `extensions` to match, so this class of bug fails locally from here on.
--
-- `gen_random_uuid` is unaffected: it is core Postgres from 13 onward, not
-- pgcrypto, which is why every other function kept working.
--
-- Adding `extensions` to the path rather than qualifying the call keeps the
-- function working on a plain Postgres too, where that schema does not exist
-- and is simply skipped.

create or replace function public.mint_connect_token(p_ttl_seconds integer default 120)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_exp   timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_ttl_seconds is null or p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'ttl out of range';
  end if;

  -- Columns are qualified because this function's OUT parameters are named
  -- `token` and `expires_at`, which would otherwise shadow the columns.
  update public.connect_tokens
     set expires_at = now()
   where connect_tokens.user_id = v_uid
     and connect_tokens.consumed_at is null
     and connect_tokens.expires_at > now();

  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  v_exp   := now() + make_interval(secs => p_ttl_seconds);

  insert into public.connect_tokens (token, user_id, expires_at)
  values (v_token, v_uid, v_exp);

  return query select v_token, v_exp;
end;
$fn$;

-- create or replace resets the grants, so put it back.
revoke all on function public.mint_connect_token(integer) from public;
grant execute on function public.mint_connect_token(integer) to authenticated;
