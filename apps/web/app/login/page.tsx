import { AuthForm } from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <>
      <h1>Sign in</h1>
      <p className="lede">Username and password. That is all v1 asks for.</p>
      <AuthForm mode="login" />
    </>
  );
}
