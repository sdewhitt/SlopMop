import React from 'react';
import { useTheme } from '../../../hooks/useTheme';

// for theme toggle (story 30)
export default function ThemeToggle({ embedded = false }: { embedded?: boolean }) {
  const { themePreference, resolvedTheme, toggleTheme, setSystemTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const modeLabel = isLight ? 'Light mode' : 'Dark mode';

  const toggleControl = (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-2 py-1.5 transition-colors hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 cursor-pointer"
      aria-label={`${modeLabel}. Click to switch.`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          isLight ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300' : 'text-gray-400 dark:text-gray-500'
        }`}
        aria-hidden
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
        </svg>
      </span>

      <div className="relative h-7 w-14 rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`absolute top-1 bottom-1 w-6 rounded-full bg-white shadow ring-1 ring-gray-300/80 transition-all duration-200 ease-out dark:bg-gray-600 dark:ring-gray-500 ${
            isLight ? 'left-1' : 'right-1'
          }`}
        />
      </div>

      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
          !isLight ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-300' : 'text-gray-400 dark:text-gray-500'
        }`}
        aria-hidden
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </button>
  );

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0">{modeLabel}</span>
        {toggleControl}
      </div>

      {themePreference === 'system' && (
        <p className="mt-1.5 text-[11px] text-gray-600 dark:text-gray-400">Matches your device settings.</p>
      )}

      {themePreference !== 'system' && (
        <button
          type="button"
          onClick={() => setSystemTheme()}
          className="mt-2 w-full rounded-lg border border-gray-200 bg-white py-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-800 cursor-pointer"
        >
          Use device theme
        </button>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-0">{body}</div>;
  }

  return <section>{body}</section>;
}
