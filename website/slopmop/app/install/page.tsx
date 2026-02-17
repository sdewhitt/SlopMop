import Link from "next/link";

export const metadata = {
  title: "Install — SlopMop",
};

export default function InstallPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Install SlopMop</h1>
      <p className="mt-4 max-w-md text-neutral-600 dark:text-neutral-400">
        Get SlopMop for your browser in seconds. Currently available for: ...
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-4">
        <a
          href="#"
          className="rounded-full bg-foreground px-8 py-3 font-semibold text-background transition hover:opacity-80"
        >
          Chrome Web Store
        </a>
        {/*<a
          href="#"
          className="rounded-full border border-foreground px-8 py-3 font-semibold transition hover:bg-foreground hover:text-background"
        >
          Firefox Add-ons
        </a>*/}
        
      </div>

      <Link href="/" className="mt-8 text-sm text-neutral-500 hover:underline">
        ← Back to home
      </Link>
    </div>
  );
}
