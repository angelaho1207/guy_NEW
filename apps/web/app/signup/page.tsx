import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <>
      <h1>Create an account</h1>
      <p className="lede">
        Your first and last name are the only things you have to fill in.
        Everything else on your profile is optional, and every field has its own
        switch for whether it is shared.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}
