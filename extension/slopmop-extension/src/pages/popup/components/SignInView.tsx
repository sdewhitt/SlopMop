import React, { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import logo from '@assets/img/logo.svg';

export default function SignInView() {
  const { logIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await logIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim()
          : 'Authentication failed.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error('[SignInView] Google sign-in error:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Google sign-in failed.',
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="w-full bg-gray-900 text-white p-4 flex flex-col items-center gap-4 overflow-hidden overscroll-none">
      {/* Header */}
      <div className="flex items-center gap-3 w-full">
        <img src={logo} className="h-9 w-9" alt="SlopMop logo" />
        <h1 className="text-lg font-bold tracking-tight">SlopMop</h1>
      </div>

      {/* Title */}
      <h2 className="text-sm font-semibold text-gray-200 mt-1">
        {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
      </h2>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2.5">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
        >
          {loading
            ? mode === 'login'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'login'
              ? 'Sign In'
              : 'Sign Up'}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-[10px] text-gray-500 uppercase">or</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      {/* Google sign-in */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 py-2 text-xs font-medium text-gray-200 transition hover:bg-gray-700 disabled:opacity-50 cursor-pointer"
      >
        <GoogleIcon />
        {googleLoading ? 'Signing in…' : 'Continue with Google'}
      </button>

      {/* Toggle between login / signup */}
      <p className="text-[11px] text-gray-400">
        {mode === 'login' ? (
          <>
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError('');
              }}
              className="text-blue-400 hover:underline cursor-pointer"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className="text-blue-400 hover:underline cursor-pointer"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
