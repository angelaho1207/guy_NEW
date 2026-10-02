import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Set by the middleware when a redirect brought them here, so a scanned
  // connect code survives signing in. signIn() checks it is a local path.
  const { next } = await searchParams;

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
      <AuthForm mode="login" next={next} />
      <p className="tiny" style={{ margin: '20px 0 0', color: 'var(--text-muted)' }}>
        Nothing about you is visible to anyone until you both tap confirm,
        standing in the same room.
      </p>
    </>
  );
}
