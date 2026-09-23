import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { ProfileForm } from '@/components/ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const me = await currentUser();

  const [profile] = await asUser<Record<string, string | null>>(
    me.user_id,
    `select * from public.profiles`,
  );

  const shareRows = await asUser<{ field: string; shareable: boolean }>(
    me.user_id,
    `select field, shareable from public.profile_field_shares`,
  );

  const shares = Object.fromEntries(shareRows.map((r) => [r.field, r.shareable]));
  const off = shareRows.filter((r) => !r.shareable).length;

  return (
    <>
      <h1>Your profile</h1>
      <p className="lede">
        Every field has a switch. Turn one off and it disappears from everyone
        you are connected with, right away. Turn it back on and they see
        whatever it says now.
      </p>

      <div className="banner">
        {off === 0
          ? 'You are sharing every field. A field you leave blank still shows, as a dash.'
          : `${off} ${off === 1 ? 'field is' : 'fields are'} private. Nobody you are connected with can see ${off === 1 ? 'it' : 'them'}.`}
      </div>

      <ProfileForm profile={profile} shares={shares} />
    </>
  );
}
