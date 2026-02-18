import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-sm text-neutral-500">
        <span>&copy; {new Date().getFullYear()} SlopMop</span>
        <div className="flex gap-4">
          <Link href="/faq" className="hover:underline">
            FAQ
          </Link>
          <Link href="/install" className="hover:underline">
            Install
          </Link>
          <Link href="/signup" className="hover:underline">
            Sign Up
          </Link>
        </div>
      </div>
    </footer>
  );
}
