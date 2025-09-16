import React, { useState, useEffect, useCallback, useRef } from 'react';

const AdminDashboard = () => {
  const [submissions, setSubmissions] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [fees, setFees] = useState([]); // <-- New state for fees
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const requestIdRef = useRef(0);
  const allowFallback = import.meta.env.VITE_ENABLE_SAMPLE_FALLBACK === 'true';

  const fetchData = useCallback(() => {
    const currentId = ++requestIdRef.current; // unique id per fetch to avoid races
    setMessage('');
    setLoading(true);
    const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL; // use unified/correct env var

    // Helper to load fallback sample data from public folder
    const loadFallback = async (currentSubs = [], currentRooms = []) => {
      if (!allowFallback) {
        if (requestIdRef.current === currentId) {
          setMessage('Live data failed to load. Set VITE_ENABLE_SAMPLE_FALLBACK=true to show sample data.');
          setSubmissions(currentSubs);
          setRooms(currentRooms);
        }
        return;
      }
      try {
        if (!currentSubs.length) {
          const respSubs = await fetch('/data/submissions.sample.json');
          if (respSubs.ok) {
            const dataSubs = await respSubs.json();
            if (requestIdRef.current === currentId) {
              setSubmissions(Array.isArray(dataSubs) ? dataSubs : []);
            }
          } else if (requestIdRef.current === currentId) {
            setSubmissions([]);
          }
        } else if (requestIdRef.current === currentId) {
          setSubmissions(currentSubs);
        }
      } catch (e) {
        console.warn('Failed to load submissions sample fallback', e);
        if (requestIdRef.current === currentId) setSubmissions(currentSubs);
      }

      try {
        if (!currentRooms.length) {
          const respRooms = await fetch('/data/rooms.sample.json');
          if (respRooms.ok) {
            const dataRooms = await respRooms.json();
            if (requestIdRef.current === currentId) {
              setRooms(Array.isArray(dataRooms) ? dataRooms : []);
            }
          } else if (requestIdRef.current === currentId) {
            setRooms([]);
          }
        } else if (requestIdRef.current === currentId) {
          setRooms(currentRooms);
        }
      } catch (e) {
        console.warn('Failed to load rooms sample fallback', e);
        if (requestIdRef.current === currentId) setRooms(currentRooms);
      }
    };

    if (!baseURL) {
      console.warn('VITE_APPS_SCRIPT_URL is missing. Loading sample data.');
      loadFallback().finally(() => { if (requestIdRef.current === currentId) setLoading(false); });
      return () => {};
    }

    // JSONP helper (shorter timeout)
    const loadJSONP = (url, callbackName, elementId, timeoutMs = 12000) => {
      return new Promise((resolve, reject) => {
        if (!url) {
          reject(new Error('Missing URL'));
          return;
        }
        let timerId;
        const cleanup = () => {
          const el = document.getElementById(elementId);
          if (el && el.parentNode) el.parentNode.removeChild(el);
          try { delete window[callbackName]; } catch { /* ignore error */ }
          if (timerId) clearTimeout(timerId);
        };

        window[callbackName] = (data) => {
          cleanup();
          resolve(data);
        };

        const script = document.createElement('script');
        script.id = elementId;
        const cacheBuster = `&_=${Date.now()}`;
        const sep = url.includes('?') ? '&' : '?';
        script.src = `${url}${sep}callback=${callbackName}${cacheBuster}`;
        script.async = true;
        script.onerror = () => { cleanup(); reject(new Error('Script load error')); };
        document.body.appendChild(script);

        timerId = window.setTimeout(() => {
          cleanup();
          reject(new Error('JSONP request timed out'));
        }, timeoutMs);
      });
    };

    // Parallel requests with single retry on total failure
    const runAttempt = (suffix) => {
      const cb1 = `handleDashboardData_cb1_${currentId}_${suffix}`;
      const cb2 = `handleDashboardData_cb2_${currentId}_${suffix}`;
      const p1 = loadJSONP(baseURL, cb1, `jsonp-dashboard-1-${currentId}-${suffix}`);
      const p2 = loadJSONP(`${baseURL}?action=getStudentsAndHostels`, cb2, `jsonp-dashboard-2-${currentId}-${suffix}`);
      return Promise.allSettled([p1, p2]);
    };

    (async () => {
      let results = await runAttempt('a');
      // If both failed, retry once after short delay
      if (results[0].status !== 'fulfilled' && results[1].status !== 'fulfilled') {
        await new Promise(r => setTimeout(r, 800));
        results = await runAttempt('b');
      }

      const p1Ok = results[0].status === 'fulfilled';
      const p2Ok = results[1].status === 'fulfilled';
      const r1 = p1Ok ? results[0].value : null;
      const r2 = p2Ok ? results[1].value : null;

      let subs = [];
      if (Array.isArray(r1)) subs = r1; // legacy: array of submissions
      else if (r1 && Array.isArray(r1.submissions)) subs = r1.submissions;

      let rms = [];
      if (r1 && Array.isArray(r1.rooms)) rms = r1.rooms;
      else if (r2 && Array.isArray(r2.rooms)) rms = r2.rooms;

      let fs = [];
      if (r1 && Array.isArray(r1.fees)) fs = r1.fees;

      if (requestIdRef.current !== currentId) return; // stale

      if (p1Ok || p2Ok) {
        setSubmissions(Array.isArray(subs) ? subs : []);
        setRooms(Array.isArray(rms) ? rms : []);
        setFees(Array.isArray(fs) ? fs : []);
      } else {
        await loadFallback();
      }
      if (requestIdRef.current === currentId) setLoading(false);
    })().catch(async (err) => {
      console.warn('Failed to load live data.', err);
      if (requestIdRef.current !== currentId) return; // stale
      await loadFallback();
      if (requestIdRef.current === currentId) setLoading(false);
    });

    return () => {
      const ids = [
        `jsonp-dashboard-1-${currentId}-a`,
        `jsonp-dashboard-2-${currentId}-a`,
        `jsonp-dashboard-1-${currentId}-b`,
        `jsonp-dashboard-2-${currentId}-b`,
        `jsonp-dashboard-1-${currentId}`,
        `jsonp-dashboard-2-${currentId}`,
      ];
      ids.forEach(id => { const el = document.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); });
    };

  }, [allowFallback]);

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup; // Ensure proper cleanup to avoid duplicate JSONP under StrictMode
  }, [fetchData]);

  // --- Calculate Key Metrics ---
  const totalSubmissions = submissions.length;
  const isPaidStatus = (s) => typeof s === 'string' && ['paid', 'completed', 'success', 'successful'].includes(s.toLowerCase());
  const paidTransactions = fees.filter(f => isPaidStatus(f.Status)).length;
  const totalFeesCollected = fees.reduce((sum, fee) => {
    return isPaidStatus(fee.Status) ? sum + Number(fee.Amount || 0) : sum;
  }, 0);
  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter(r => r.Status === 'Occupied').length;

  if (loading && !submissions.length && !rooms.length && !fees.length) return <div className="p-8 text-center font-semibold">Loading Dashboard Data...</div>;

  return (
    <div className="bg-gray-50 min-h-screen p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-purple-800 mb-4">Administrator Dashboard</h1>
        {message && (
          <div className="mb-6 flex items-center justify-between text-sm text-gray-700 bg-yellow-50 border border-yellow-200 p-2 rounded-md">
            <p>{message}</p>
            <button onClick={() => setMessage('')} className="px-2 py-1 text-gray-600 hover:text-gray-900">Dismiss</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-gray-600">Total Applications</h2>
            <p className="text-4xl font-bold text-indigo-600 mt-2">{totalSubmissions}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-gray-600">Paid Transactions</h2>
            <p className="text-4xl font-bold text-green-600 mt-2">{paidTransactions}</p>
          </div>
          {/* --- NEW CARD FOR TOTAL FEES --- */}
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-gray-600">Total Fees Collected</h2>
            <p className="text-4xl font-bold text-green-600 mt-2">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalFeesCollected)}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold text-gray-600">Hostel Occupancy</h2>
            <p className="text-4xl font-bold text-blue-600 mt-2">{occupiedRooms} / {totalRooms}</p>
          </div>
        </div>

        {/* Recent Submissions Table */}
        <div className="bg-white rounded-lg shadow-lg overflow-x-auto">
          {/* ... Table JSX remains the same ... */}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;