import React, { useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { normalizeHost, validateHost } from '@src/utils/disabledWebsites';

export default function DisabledWebsitesManager() {
  const [uid, setUid] = useState<string | undefined>(undefined);

  useEffect(() => {
    browser.storage.local.get('slopmopUser').then((result) => {
      const u = result['slopmopUser'] as { uid: string } | undefined;
      setUid(u?.uid);
    });
  }, []);

  const [sites, setSites] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [addError, setAddError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    browser.runtime
      .sendMessage({ type: 'SLOPMOP_GET_IGNORED_SITES', uid })
      .then((res: { success: boolean; data?: string[] }) => {
        if (res?.success && Array.isArray(res.data)) setSites(res.data);
      })
      .catch(console.error);
  }, [uid]);

  const handleAdd = async () => {
    const normalized = normalizeHost(input);
    const err = validateHost(normalized);
    if (err) { setAddError(err); return; }

    const res: { success: boolean; error?: string } = await browser.runtime.sendMessage({
      type: 'SLOPMOP_ADD_IGNORED_SITE',
      uid,
      site: input,
    });

    if (!res.success) {
      setAddError(res.error ?? 'Failed to add site.');
      return;
    }

    setSites((prev) => [...prev, normalized]);
    setInput('');
    setAddError('');
    inputRef.current?.focus();
  };

  const handleDelete = async (site: string) => {
    const res: { success: boolean } = await browser.runtime.sendMessage({
      type: 'SLOPMOP_REMOVE_IGNORED_SITE',
      uid,
      site,
    });
    if (res.success) setSites((prev) => prev.filter((s) => s !== site));
  };

  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Disabled Websites
      </h2>

      <div className="bg-gray-900 rounded-xl p-4 space-y-4">
        <p className="text-xs text-gray-500">
          AI detection will be skipped on these sites (including subdomains).
        </p>

        {/* Add input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setAddError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="example.com or https://example.com"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shrink-0"
          >
            Add
          </button>
        </div>

        {addError && <p className="text-xs text-red-400 -mt-2">{addError}</p>}

        {/* List */}
        {sites.length === 0 ? (
          <p className="text-sm text-gray-600 py-2">No disabled websites yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {sites.map((site) => (
              <li key={site} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-gray-200 truncate mr-4">{site}</span>
                <button
                  onClick={() => handleDelete(site)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-gray-800 shrink-0"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
