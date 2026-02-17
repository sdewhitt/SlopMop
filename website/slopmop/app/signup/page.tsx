import Link from "next/link";

export const metadata = {
  title: "Sign Up — SlopMop",
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Create Your Account</h1>
      <p className="mt-4 max-w-md text-neutral-600 dark:text-neutral-400">
        Sign up to sync your settings across devices and get usage statistics.
      </p>

      {/* Placeholder form — replace with real auth later */}
      <form className="mt-10 flex w-full max-w-sm flex-col gap-4">
        <input
          type="email"
          placeholder="you@example.com"
          className="rounded-lg border border-neutral-300 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="rounded-lg border border-neutral-300 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          required
        />
        <button
          type="submit"
          className="rounded-full bg-foreground px-6 py-3 font-semibold text-background transition hover:opacity-80"
        >
          Sign Up
        </button>
      </form>

      <Link href="/" className="mt-8 text-sm text-neutral-500 hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
