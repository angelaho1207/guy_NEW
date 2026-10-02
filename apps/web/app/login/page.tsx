import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <>
      <div className="hero">
        <h1 className="hero-title">
          You met.
          <br />
          Now keep it.
        </h1>
      </div>
      <p className="lede">
        Swap only what you choose to, with people you actually spoke to.
      </p>
      <AuthForm mode="login" />
    </>
  );
}
