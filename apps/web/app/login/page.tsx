import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <>
      <div className="hero">
        <span className="hero-mark">Guy.</span>
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
      <p className="tiny" style={{ margin: '20px 0 0', color: 'var(--text-muted)' }}>
        Nothing about you is visible to anyone until you both tap confirm,
        standing in the same room.
      </p>
    </>
  );
}
