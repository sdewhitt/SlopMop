import React, { useEffect, useRef, useState } from 'react';
import {
  type DisabledWebsite,
  getDisabledWebsites,
  setDisabledWebsites,
  normalizeHost,
  validateHost,
} from '@src/utils/disabledWebsites';

export default function DisabledWebsitesManager() {
  const [sites, setSites] = useState<DisabledWebsite[]>([]);
  const [input, setInput] = useState('');
  const [addError, setAddError] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editError, setEditError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDisabledWebsites().then(setSites);
  }, []);

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  /** Persist latest-write-wins — no debounce needed for this storage pattern. */
  const persist = (updated: DisabledWebsite[]) => {
    setSites(updated);
    setDisabledWebsites(updated);
  };

  const handleAdd = () => {
    const normalized = normalizeHost(input);
    const err = validateHost(normalized);
    if (err) { setAddError(err); return; }
    if (sites.some((s) => s.value === normalized)) {
      setAddError('This site is already in the list.');
      return;
    }
    const entry: DisabledWebsite = {
      id: crypto.randomUUID(),
      value: normalized,
      createdAt: Date.now(),
    };
    persist([...sites, entry]);
    setInput('');
    setAddError('');
    inputRef.current?.focus();
  };

  const handleDelete = (id: string) => {
    persist(sites.filter((s) => s.id !== id));
  };

  const startEdit = (site: DisabledWebsite) => {
    setEditingId(site.id);
    setEditingValue(site.value);
    setEditError('');
  };

  const confirmEdit = (id: string) => {
    const normalized = normalizeHost(editingValue);
    const err = validateHost(normalized);
    if (err) { setEditError(err); return; }
    if (sites.some((s) => s.value === normalized && s.id !== id)) {
      setEditError('This site is already in the list.');
      return;
    }
    persist(sites.map((s) => (s.id === id ? { ...s, value: normalized } : s)));
    setEditingId(null);
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError('');
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

        {/* ── Add input ── */}
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

        {addError && (
          <p className="text-xs text-red-400 -mt-2">{addError}</p>
        )}

        {/* ── List ── */}
        {sites.length === 0 ? (
          <p className="text-sm text-gray-600 py-2">No disabled websites yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {sites.map((site) =>
              editingId === site.id ? (
                /* ── Edit row ── */
                <li key={site.id} className="py-2.5 space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      ref={editRef}
                      type="text"
                      value={editingValue}
                      onChange={(e) => { setEditingValue(e.target.value); setEditError(''); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit(site.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="flex-1 bg-gray-800 border border-blue-500 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none transition-colors"
                    />
                    <button
                      onClick={() => confirmEdit(site.id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {editError && (
                    <p className="text-xs text-red-400">{editError}</p>
                  )}
                </li>
              ) : (
                /* ── View row ── */
                <li key={site.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-200 truncate mr-4">{site.value}</span>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(site)}
                      className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(site.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-gray-800"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
