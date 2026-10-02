import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <>
      <div className="hero">
        <h1 className="hero-title">
          Start with
          <br />
          your name.
        </h1>
      </div>
      <p className="lede">
        Your first and last name are the only things you have to fill in.
        Everything else on your profile is optional, and every field has its own
        switch for whether it is shared.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}
