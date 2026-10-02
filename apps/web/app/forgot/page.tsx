import Link from 'next/link';
import { ForgotForm } from '@/components/ForgotForm';

export const dynamic = 'force-dynamic';

export default function ForgotPage() {
  return (
    <>
      <h1 style={{ marginTop: 24 }}>Forgotten password</h1>
      <p className="lede">
        We will email you a link to set a new one. It goes to the address you
        signed up with, which is not your username.
      </p>

      <ForgotForm />

      <p className="tiny" style={{ marginTop: 20 }}>
        <Link className="handle-link" href="/login">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
