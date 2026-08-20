'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const googleCode = searchParams.get('google_code');
    const googleError = searchParams.get('google_error');

    if (googleCode) {
      api.auth.exchangeCode(googleCode)
        .then((res) => {
          document.cookie = `crm_token=${encodeURIComponent(res.token)}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
          router.push('/dashboard');
        })
        .catch((err) => {
          setError(`Google sign-in failed: ${err instanceof Error ? err.message : 'Exchange failed'}`);
        });
      return;
    }

    if (googleError) {
      setError(`Google sign-in failed: ${googleError.replace(/_/g, ' ')}`);
    }
  }, [searchParams, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.login(username, password);
      document.cookie = `crm_token=${encodeURIComponent(res.token)}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');
    try {
      const { url } = await api.auth.googleLoginUrl();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in');
      setGoogleLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 sm:p-8 space-y-4 shadow-sm">
      <button
        type="button"
        onClick={() => void handleGoogleLogin()}
        disabled={googleLoading || loading}
        className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2.5 text-xs font-semibold"
      >
        <GoogleIcon />
        <span>{googleLoading ? 'Redirecting…' : 'Continue with Google'}</span>
      </button>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500">
          <span className="bg-white dark:bg-zinc-900 px-3">or credentials</span>
        </div>
      </div>

      <div>
        <label className="form-label text-xs">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="form-input text-xs"
          placeholder="Enter your username"
          autoComplete="username"
          required
        />
      </div>

      <div>
        <label className="form-label text-xs">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-input text-xs"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />
      </div>

      {error && (
        <p className="text-rose-600 dark:text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || googleLoading}
        className="btn-primary w-full py-2.5 text-xs font-semibold justify-center mt-1"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 pt-1">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-zinc-900 dark:text-zinc-100 hover:underline font-semibold">
          Create account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-xl mb-3 shadow-xs font-bold text-sm tracking-tighter">
            CR
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Welcome back</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5">Recruiter & Outreach Automation Suite</p>
        </div>

        <Suspense fallback={<div className="card p-8 text-center text-zinc-400 text-xs">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

