import React, { useState, useCallback, useRef } from 'react';

export default function StudentRoute() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqIdRef = useRef(0);
  const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL;

  const loadJSONP = (url, cbName, elId, timeoutMs = 12000) => new Promise((resolve, reject) => {
    if (!url) return reject(new Error('Missing URL'));
    let timerId;
    const cleanup = () => {
      const el = document.getElementById(elId);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      try { delete window[cbName]; } catch { /* ignore */ }
      if (timerId) clearTimeout(timerId);
    };
    window[cbName] = (data) => { cleanup(); resolve(data); };
    const script = document.createElement('script');
    script.id = elId;
    const sep = url.includes('?') ? '&' : '?';
    const cacheBuster = `&_=${Date.now()}`;
    script.src = `${url}${sep}callback=${cbName}${cacheBuster}`;
    script.async = true;
    script.onerror = () => { cleanup(); reject(new Error('Script load error')); };
    document.body.appendChild(script);
    timerId = window.setTimeout(() => { cleanup(); reject(new Error('JSONP request timed out')); }, timeoutMs);
  });

  const search = useCallback(async () => {
    const current = ++reqIdRef.current;
    setError('');
    setResult(null);
    if (!baseURL) {
      setError('Backend URL missing');
      return;
    }
    const q = query.trim();
    if (!q) { setError('Enter name, email, mobile or application id'); return; }
    setLoading(true);
    try {
      const cb = `student_search_${current}`;
      const url = `${baseURL}?action=searchStudents&q=${encodeURIComponent(q)}`;
      const data = await loadJSONP(url, cb, `jsonp-student-search-${current}`);
      if (reqIdRef.current !== current) return;
      setResult(data);
    } catch (e) {
      if (reqIdRef.current !== current) return;
      setError(e.message || String(e));
    } finally {
      if (reqIdRef.current === current) setLoading(false);
    }
  }, [baseURL, query]);

  const fetchDetails = useCallback(async (appId) => {
    const current = ++reqIdRef.current;
    setError('');
    setLoading(true);
    try {
      const cb = `student_details_${current}`;
      const url = `${baseURL}?action=getStudentDetails&id=${encodeURIComponent(appId)}`;
      const data = await loadJSONP(url, cb, `jsonp-student-details-${current}`);
      if (reqIdRef.current !== current) return;
      setResult(data);
    } catch (e) {
      if (reqIdRef.current !== current) return;
      setError(e.message || String(e));
    } finally {
      if (reqIdRef.current === current) setLoading(false);
    }
  }, [baseURL]);

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Application ID, Name, Email or Mobile"
          className="flex-1 border rounded px-3 py-2"
        />
        <button onClick={search} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">Search</button>
      </div>

      {loading && <div className="p-4 text-gray-600">Loading…</div>}
      {error && <div className="p-3 text-red-700 bg-red-50 border border-red-200 rounded">{error}</div>}

      {result && result.results && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">Matches</h2>
          <ul className="divide-y">
            {result.results.map((r) => (
              <li key={r.applicationId} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.name || 'Unknown'} <span className="text-gray-500">({r.applicationId})</span></div>
                  <div className="text-sm text-gray-600">{r.email} {r.mobile && `• ${r.mobile}`}</div>
                </div>
                <button onClick={() => fetchDetails(r.applicationId)} className="text-blue-600 hover:underline">View</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.found && (
        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2">Student</h2>
            <pre className="bg-gray-50 border rounded p-3 overflow-auto text-sm">{JSON.stringify(result.student, null, 2)}</pre>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Fees</h3>
            {(!result.fees || result.fees.length === 0) ? (
              <div className="text-gray-600">No fee records.</div>
            ) : (
              <pre className="bg-gray-50 border rounded p-3 overflow-auto text-sm">{JSON.stringify(result.fees, null, 2)}</pre>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Hostel</h3>
            {result.hostel ? (
              <pre className="bg-gray-50 border rounded p-3 overflow-auto text-sm">{JSON.stringify(result.hostel, null, 2)}</pre>
            ) : (
              <div className="text-gray-600">No hostel assignment.</div>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">Library Loans</h3>
            {(!result.library || result.library.length === 0) ? (
              <div className="text-gray-600">No current loans.</div>
            ) : (
              <pre className="bg-gray-50 border rounded p-3 overflow-auto text-sm">{JSON.stringify(result.library, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
