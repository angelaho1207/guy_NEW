import { ResetForm } from '@/components/ResetForm';

export const dynamic = 'force-dynamic';

/**
 * Reachable only with a session, which the recovery link established when
 * /auth/confirm verified its token. The middleware turns away anyone without
 * one, so there is nothing further to check here.
 */
export default function ResetPage() {
  return (
    <>
      <h1 style={{ marginTop: 24 }}>New password</h1>
      <p className="lede">
        Set it and you are signed in. Your username does not change.
      </p>
      <ResetForm />
    </>
  );
}
