import React, { useState, useCallback, useRef } from 'react';

export default function StudentRoute() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqIdRef = useRef(0);
  const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL;

  // Formatting helpers and UI utilities
  const formatINR = (amt) => {
    const n = Number(amt);
    if (Number.isNaN(n)) return '-';
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n); } catch { return `₹${n.toFixed(2)}`; }
  };
  const formatDate = (d) => {
    if (!d) return '-';
    const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
    if (Number.isNaN(dt?.getTime?.())) return '-';
    try { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(dt); } catch { return dt.toLocaleString?.() || String(d); }
  };
  const badge = (txt) => {
    const t = String(txt || '').toLowerCase();
    const base = 'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium';
    if (/(paid|complete|success)/.test(t)) return `${base} bg-green-100 text-green-800`;
    if (/(pending|due)/.test(t)) return `${base} bg-yellow-100 text-yellow-800`;
    if (/(failed|error|cancel)/.test(t)) return `${base} bg-red-100 text-red-800`;
    if (/(occupied|issued)/.test(t)) return `${base} bg-blue-100 text-blue-800`;
    if (/(vacant|available|returned)/.test(t)) return `${base} bg-emerald-100 text-emerald-800`;
    return `${base} bg-gray-100 text-gray-800`;
  };
  const fullName = (s) => (s?.name || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Unknown').trim();
  const receiptUrlFrom = (txn) => txn?.receiptUrl || txn?.receiptURL || txn?.ReceiptURL || txn?.invoiceUrl || txn?.InvoiceURL || txn?.Receipt || '';
  const printableReceiptHtml = (txn, student) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fee Receipt - ${student?.ApplicationId || student?.applicationId || ''}</title>
  <style>
    body{font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; padding:24px; color:#0f172a}
    .card{max-width:720px; margin:0 auto; border:1px solid #e2e8f0; border-radius:12px; padding:24px}
    .row{display:flex; gap:16px; flex-wrap:wrap}
    .col{flex:1 1 240px}
    .muted{color:#475569}
    .h{margin:0 0 16px; font-size:20px}
    table{width:100%; border-collapse:collapse; margin-top:12px}
    th,td{padding:10px 12px; border-bottom:1px solid #e2e8f0; text-align:left}
  </style>
</head>
<body>
  <div class="card">
    <h1 class="h">Payment Receipt</h1>
    <div class="row">
      <div class="col">
        <div><strong>Name:</strong> ${fullName(student)}</div>
        <div class="muted"><strong>Application ID:</strong> ${student?.ApplicationId || student?.applicationId || '-'}</div>
      </div>
      <div class="col">
        <div><strong>Status:</strong> ${txn?.Status || '-'}</div>
        <div class="muted"><strong>Date:</strong> ${formatDate(txn?.PaymentDate || txn?.Date)}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Transaction ID</th><th>Amount</th><th>Method</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>${txn?.TransactionID || txn?.TransactionId || txn?.ID || '-'}</td>
          <td>${formatINR(txn?.Amount)}</td>
          <td>${txn?.PaymentMethod || '-'}</td>
          <td>${txn?.Description || '-'}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
</body>
</html>`;
  const openReceipt = (txn, student) => {
    const url = receiptUrlFrom(txn);
    if (url) {
      window.open(url, '_blank', 'noopener');
    } else {
      const w = window.open('', '_blank', 'noopener,width=900,height=700');
      if (!w) return;
      w.document.write(printableReceiptHtml(txn, student));
      w.document.close();
    }
  };

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
          {/* Student details card */}
          <div className="bg-white rounded-lg shadow border border-slate-200 p-5">
            <h2 className="text-xl font-semibold mb-4">Student</h2>
            {(() => {
              const s = result.student || {};
              const name = fullName(s);
              const appId = s.ApplicationId || s.applicationId || '-';
              const course = s.course || s.Course || '-';
              const dob = s.dob || s.DOB || s.dateOfBirth;
              const gender = s.gender || s.Gender;
              const category = s.category || s.Category;
              const email = s.email || '-';
              const mobile = s.mobile || s.Mobile || '-';
              const addr = [s.address, s.city, s.state, s.zip].filter(Boolean).join(', ');
              const nationality = s.nationality || s.Nationality;
              const feeStatus = s.feeStatus || s.FeeStatus;
              return (
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{name}</div>
                      <div className="text-sm text-slate-500 mt-0.5">Application ID: {appId}</div>
                    </div>
                    {feeStatus && <span className={badge(feeStatus)}>{feeStatus}</span>}
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs uppercase text-slate-500">Email</div>
                      <div className="font-medium">{email}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-slate-500">Mobile</div>
                      <div className="font-medium">{String(mobile)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-slate-500">Course</div>
                      <div className="font-medium">{course}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-slate-500">Gender</div>
                      <div className="font-medium">{gender || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-slate-500">DOB</div>
                      <div className="font-medium">{formatDate(dob)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-slate-500">Category</div>
                      <div className="font-medium">{category || '-'}</div>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <div className="text-xs uppercase text-slate-500">Address</div>
                      <div className="font-medium">{addr || '-'}</div>
                    </div>
                    {nationality && (
                      <div>
                        <div className="text-xs uppercase text-slate-500">Nationality</div>
                        <div className="font-medium">{nationality}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Fees table */}
          <div className="bg-white rounded-lg shadow border border-slate-200 p-5">
            <h3 className="text-lg font-semibold mb-3">Fees</h3>
            {(!result.fees || result.fees.length === 0) ? (
              <div className="text-gray-600">No fee records.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Method</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Description</th>
                      <th className="py-2 pr-4">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fees.map((t, idx) => (
                      <tr key={t.TransactionID || t.TransactionId || t.ID || idx} className="border-b last:border-0">
                        <td className="py-2 pr-4">{formatDate(t.PaymentDate || t.Date)}</td>
                        <td className="py-2 pr-4 font-medium">{formatINR(t.Amount)}</td>
                        <td className="py-2 pr-4">{t.PaymentMethod || '-'}</td>
                        <td className="py-2 pr-4"><span className={badge(t.Status)}>{t.Status || '-'}</span></td>
                        <td className="py-2 pr-4">{t.Description || '-'}</td>
                        <td className="py-2 pr-4">
                          <button
                            onClick={() => openReceipt(t, result.student)}
                            className="inline-flex items-center px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800"
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Hostel card */}
          <div className="bg-white rounded-lg shadow border border-slate-200 p-5">
            <h3 className="text-lg font-semibold mb-3">Hostel</h3>
            {result.hostel ? (
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-xs uppercase text-slate-500">Room Number</div>
                  <div className="font-medium">{result.hostel.RoomNumber || result.hostel.roomNumber || '-'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500">Status</div>
                  <div><span className={badge(result.hostel.Status || result.hostel.status)}>{result.hostel.Status || result.hostel.status || '-'}</span></div>
                </div>
              </div>
            ) : (
              <div className="text-gray-600">No hostel assignment.</div>
            )}
          </div>

          {/* Library loans */}
          <div className="bg-white rounded-lg shadow border border-slate-200 p-5">
            <h3 className="text-lg font-semibold mb-3">Library Loans</h3>
            {(!result.library || result.library.length === 0) ? (
              <div className="text-gray-600">No current loans.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Issued</th>
                      <th className="py-2 pr-4">Due</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.library.map((l, idx) => (
                      <tr key={l.LoanID || l.Id || idx} className="border-b last:border-0">
                        <td className="py-2 pr-4">{l.title || l.BookTitle || l.Book || l.BookID || '-'}</td>
                        <td className="py-2 pr-4">{formatDate(l.IssueDate || l.IssuedOn)}</td>
                        <td className="py-2 pr-4">{formatDate(l.DueDate)}</td>
                        <td className="py-2 pr-4"><span className={badge(l.Status || l.status)}>{l.Status || l.status || '-'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
