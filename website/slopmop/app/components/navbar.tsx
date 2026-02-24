import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-black/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-bold tracking-tight">
          SlopMop
        </Link>
        <ul className="flex gap-6 text-sm font-medium">
          <li>
            <Link href="/install" className="hover:underline">
              Install
            </Link>
          </li>
          <li>
            <a href="/#faq" className="hover:underline">
              FAQ
            </a>
          </li>
          <li>
            <Link
              href="/signup"
              className="rounded-full bg-foreground px-4 py-1.5 text-background transition hover:opacity-80"
            >
              Sign Up
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
