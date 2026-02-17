import Link from "next/link";
import Navbar from "../components/navbar";
import Footer from "../components/footer";

export const metadata = {
    title: "Sign Up — SlopMop",
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-foreground dark:bg-black">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        
        <h1 className="text-4xl font-bold tracking-tight">
            Create Your Account
        </h1>

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
      </main>
      <Footer />
    </div>
  );
}
