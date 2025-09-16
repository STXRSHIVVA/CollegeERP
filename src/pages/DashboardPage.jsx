import React, { useState, useEffect, useCallback, useRef } from 'react';

const DashboardPage = () => {
  const [submissions, setSubmissions] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const requestIdRef = useRef(0);
  const allowFallback = import.meta.env.VITE_ENABLE_SAMPLE_FALLBACK === 'true';

  const fetchData = useCallback(() => {
    const currentId = ++requestIdRef.current;
    setMessage('');
    setLoading(true);
    const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL;

    const loadFallback = async (currentSubs = [], currentRooms = []) => {
      if (!allowFallback) {
        if (requestIdRef.current === currentId) {
          setMessage('Live data failed to load. Set VITE_ENABLE_SAMPLE_FALLBACK=true to show sample data.');
          setSubmissions(currentSubs);
          setRooms(currentRooms);
          setFees([]);
        }
        return;
      }
      try {
        // Submissions fallback
        if (!currentSubs.length) {
          const respSubs = await fetch('/data/submissions.sample.json');
          if (respSubs.ok) {
            const dataSubs = await respSubs.json();
            if (requestIdRef.current === currentId) setSubmissions(Array.isArray(dataSubs) ? dataSubs : []);
          } else if (requestIdRef.current === currentId) setSubmissions([]);
        } else if (requestIdRef.current === currentId) setSubmissions(currentSubs);
      } catch {
        if (requestIdRef.current === currentId) setSubmissions(currentSubs);
      }

      try {
        // Rooms fallback
        if (!currentRooms.length) {
          const respRooms = await fetch('/data/rooms.sample.json');
          if (respRooms.ok) {
            const dataRooms = await respRooms.json();
            if (requestIdRef.current === currentId) setRooms(Array.isArray(dataRooms) ? dataRooms : []);
          } else if (requestIdRef.current === currentId) setRooms([]);
        } else if (requestIdRef.current === currentId) setRooms(currentRooms);
      } catch {
        if (requestIdRef.current === currentId) setRooms(currentRooms);
      }

      if (requestIdRef.current === currentId) setFees([]);
    };

    if (!baseURL) {
      console.warn('VITE_APPS_SCRIPT_URL is missing. Loading sample data.');
      loadFallback().finally(() => { if (requestIdRef.current === currentId) setLoading(false); });
      return () => {};
    }

    const loadJSONP = (url, callbackName, elementId, timeoutMs = 12000) => {
      return new Promise((resolve, reject) => {
        let timerId;
        const cleanup = () => {
          const el = document.getElementById(elementId);
          if (el && el.parentNode) el.parentNode.removeChild(el);
          try { delete window[callbackName]; } catch { /* ignore */ }
          if (timerId) clearTimeout(timerId);
        };
        window[callbackName] = (data) => { cleanup(); resolve(data); };
        const script = document.createElement('script');
        script.id = elementId;
        const sep = url.includes('?') ? '&' : '?';
        const cacheBuster = `&_=${Date.now()}`;
        script.src = `${url}${sep}callback=${callbackName}${cacheBuster}`;
        script.async = true;
        script.onerror = () => { cleanup(); reject(new Error('Script load error')); };
        document.body.appendChild(script);
        timerId = window.setTimeout(() => { cleanup(); reject(new Error('JSONP request timed out')); }, timeoutMs);
      });
    };

    (async () => {
      try {
        const cb = `dashboard_cb_${currentId}`;
        const data = await loadJSONP(baseURL, cb, `jsonp-dashboard-${currentId}`);
        if (requestIdRef.current !== currentId) return;

        const subs = data && Array.isArray(data.submissions) ? data.submissions : [];
        const rms = data && Array.isArray(data.rooms) ? data.rooms : [];
        const fs = data && Array.isArray(data.fees) ? data.fees : [];

        setSubmissions(subs);
        setRooms(rms);
        setFees(fs);
        setMessage('');
        setLoading(false);
      } catch (err) {
        console.warn('Failed to load live data.', err);
        if (requestIdRef.current !== currentId) return;
        await loadFallback();
        if (requestIdRef.current === currentId) setLoading(false);
      }
    })();

    return () => {
      const el = document.getElementById(`jsonp-dashboard-${currentId}`);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    };
  }, [allowFallback]);

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup;
  }, [fetchData]);

  // Metrics
  const totalSubmissions = submissions.length;
  const isPaidStatus = (s) => typeof s === 'string' && ['paid', 'completed', 'success', 'successful'].includes(s.toLowerCase());
  const totalFeesCollected = fees.reduce((sum, fee) => (isPaidStatus(fee.Status) ? sum + Number(fee.Amount || 0) : sum), 0);
  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter(r => String(r.Status).toLowerCase() === 'occupied').length;
  const occupancyPercentage = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  // INR currency
  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);

  return (
    // Render inside AppLayout's white card container without duplicating headers/sidebars
    <div className="p-6 md:p-8 lg:p-10">
      {message && (
        <div className="mb-4 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 p-2 rounded">{message}</div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-gray-500">Real-time overview of key institutional metrics.</p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <label className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">search</span>
            <input className="form-input w-full min-w-40 max-w-64 rounded-md border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-500 focus:border-sky-500 focus:ring-sky-500" placeholder="Search" />
          </label>
          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style={{ backgroundImage: `url("https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80")` }}></div>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 text-center text-gray-500">Loading Dashboard Data...</div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <span className="material-symbols-outlined">assignment</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">Admissions</p>
                <p className="text-3xl font-bold text-gray-900">{totalSubmissions}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-green-600">
                  <span className="material-symbols-outlined text-base">trending_up</span>
                  +10%
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <span className="material-symbols-outlined">payments</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">Fee Collection</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalFeesCollected)}</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-green-600">
                  <span className="material-symbols-outlined text-base">trending_up</span>
                  +5%
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <span className="material-symbols-outlined">hotel</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">Hostel Occupancy</p>
                <p className="text-3xl font-bold text-gray-900">{occupancyPercentage}%</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                  <span className="material-symbols-outlined text-base">trending_down</span>
                  -2%
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <span className="material-symbols-outlined">workspace_premium</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">Exam Pass Rate</p>
                <p className="text-3xl font-bold text-gray-900">98%</p>
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-green-600">
                  <span className="material-symbols-outlined text-base">trending_up</span>
                  +1%
                </p>
              </div>
            </div>
          </div>

          {/* Detail sections */}
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold text-gray-900">Admissions</p>
                <span className="text-sm text-gray-500">Last 12 months</span>
              </div>
              <p className="mt-1 text-3xl font-bold text-gray-900">{totalSubmissions}</p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <p className="text-gray-500">Applications Received</p>
                <p className="flex items-center gap-1 font-medium text-green-600">
                  <span className="material-symbols-outlined text-base">trending_up</span>+15%
                </p>
              </div>
              <div className="mt-6 h-48">
                <svg fill="none" height="100%" preserveAspectRatio="none" viewBox="0 0 472 150" width="100%"><path d="M0 109C18.1538 109 18.1538 21 36.3077 21C54.4615 21 54.4615 41 72.6154 41C90.7692 41 90.7692 93 108.923 93C127.077 93 127.077 33 145.231 33C163.385 33 163.385 101 181.538 101C199.692 101 199.692 61 217.846 61C236 61 236 45 254.154 45C272.308 45 272.308 121 290.462 121C308.615 121 308.615 149 326.769 149C344.923 149 344.923 1 363.077 1C381.231 1 381.231 81 399.385 81C417.538 81 417.538 129 435.692 129C453.846 129 453.846 25 472 25V150H0V109Z" fill="url(#areachart)"></path><path d="M0 109C18.1538 109 18.1538 21 36.3077 21C54.4615 21 54.4615 41 72.6154 41C90.7692 41 90.7692 93 108.923 93C127.077 93 127.077 33 145.231 33C163.385 33 163.385 101 181.538 101C199.692 101 199.692 61 217.846 61C236 61 236 45 254.154 45C272.308 45 272.308 121 290.462 121C308.615 121 308.615 149 326.769 149C344.923 149 344.923 1 363.077 1C381.231 1 381.231 81 399.385 81C417.538 81 417.538 129 435.692 129C453.846 129 453.846 25 472 25" stroke="#0ea5e9" strokeLinecap="round" strokeWidth="3"></path><defs><linearGradient gradientUnits="userSpaceOnUse" id="areachart" x1="236" x2="236" y1="1" y2="150"><stop stopColor="#bae6fd"></stop><stop offset="1" stopColor="#bae6fd" stopOpacity="0"></stop></linearGradient></defs></svg>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold text-gray-900">Enrollment Rate</p>
                <span className="text-sm text-gray-500">Last 12 months</span>
              </div>
              <p className="mt-1 text-3xl font-bold text-gray-900">83%</p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <p className="text-gray-500">New Students</p>
                <p className="flex items-center gap-1 font-medium text-green-600">
                  <span className="material-symbols-outlined text-base">trending_up</span>+8%
                </p>
              </div>
              <div className="mt-6 grid h-48 grid-cols-7 items-end gap-4 px-2">
                <div className="rounded-t-md bg-sky-200" style={{ height: '20%' }}></div>
                <div className="rounded-t-md bg-sky-200" style={{ height: '50%' }}></div>
                <div className="rounded-t-md bg-sky-200" style={{ height: '40%' }}></div>
                <div className="rounded-t-md bg-sky-500" style={{ height: '90%' }}></div>
                <div className="rounded-t-md bg-sky-500" style={{ height: '90%' }}></div>
                <div className="rounded-t-md bg-sky-200" style={{ height: '20%' }}></div>
                <div className="rounded-t-md bg-sky-200" style={{ height: '40%' }}></div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;