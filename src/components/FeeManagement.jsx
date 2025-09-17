import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const statusBadge = (status) => {
  const v = String(status || '').toLowerCase()
  if (v === 'completed' || v === 'paid' || v === 'success') return { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' }
  if (v === 'pending') return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' }
  if (v === 'failed' || v === 'error') return { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' }
  return { bg: 'bg-gray-100', text: 'text-gray-700', label: status || 'Unknown' }
}

// Normalize reading of possibly variant keys from backend/sheet headers
const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k]
    if (v !== undefined && v !== null && String(v) !== '') return v
  }
  return undefined
}

const formatAmount = (amt) => {
  const n = Number(amt)
  if (!isFinite(n)) return amt ?? '-'
  try {
    return n.toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
  } catch {
    return n.toFixed(2)
  }
}

const FeeManagement = () => {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [nameMap, setNameMap] = useState({})
  const fetchedNameIdsRef = useRef(new Set())

  const fetchFees = useCallback(() => {
    const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL
    if (!baseURL) {
      setMessage('Missing VITE_APPS_SCRIPT_URL in .env')
      setLoading(false)
      return () => {}
    }

    setLoading(true)

    let timerId
    const cb = 'handleFeesData'

    const cleanup = () => {
      const el = document.getElementById('jsonp-fees-script')
      if (el && el.parentNode) el.parentNode.removeChild(el)
      try { delete window[cb] } catch { /* no-op */ }
      if (timerId) clearTimeout(timerId)
    }

    window[cb] = (data) => {
      try {
        if (data && data.error) {
          setMessage('Error fetching fees: ' + data.error)
        } else if (Array.isArray(data)) {
          setTransactions(data)
        } else if (data && Array.isArray(data.transactions)) {
          setTransactions(data.transactions)
        } else if (data && Array.isArray(data.fees)) {
          setTransactions(data.fees)
        } else {
          setMessage('No fee data returned from backend')
        }
      } finally {
        setLoading(false)
        cleanup()
      }
    }

    const script = document.createElement('script')
    script.id = 'jsonp-fees-script'
    script.src = `${baseURL}?action=getFees&callback=${cb}&_=${Date.now()}`
    script.async = true
    script.onerror = async () => {
      // Fallback: try local sample
      try {
        const res = await fetch('/data/fees.sample.json', { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          setTransactions(Array.isArray(json) ? json : Array.isArray(json?.transactions) ? json.transactions : [])
          setMessage('Using local sample fees data. Configure backend getFees for live data.')
        } else {
          setMessage('Failed to load fees (script error)')
        }
      } catch {
        setMessage('Failed to load fees (no backend, no sample)')
      } finally {
        setLoading(false)
        cleanup()
      }
    }

    document.body.appendChild(script)

    timerId = window.setTimeout(() => {
      setMessage('Timed out fetching fee data. Check your Apps Script URL and deployment.')
      setLoading(false)
      cleanup()
    }, 12000)

    return cleanup
  }, [])

  useEffect(() => {
    const cleanup = fetchFees()
    return cleanup
  }, [fetchFees])

  useEffect(() => {
    // Enrich missing student names using getStudentDetails for each ApplicationID
    const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL
    if (!baseURL || !Array.isArray(transactions) || transactions.length === 0) return

    const toFetch = []
    for (const t of transactions) {
      const haveName = !!pick(t, ['StudentName', 'studentName', 'Student', 'student', 'ApplicantName', 'applicantName', 'Applicant', 'applicant', 'Name', 'name'])
      const appId = pick(t, ['ApplicationID', 'applicationId', 'ApplicationId'])
      if (!haveName && appId && !fetchedNameIdsRef.current.has(appId)) {
        toFetch.push(appId)
        if (toFetch.length >= 15) break // cap per batch
      }
    }
    if (toFetch.length === 0) return

    const fetchDetailsJSONP = (id, cbName, elId, timeoutMs = 12000) => new Promise((resolve, reject) => {
      let timerId
      const cleanup = () => {
        const el = document.getElementById(elId)
        if (el && el.parentNode) el.parentNode.removeChild(el)
        try { delete window[cbName] } catch { /* ignore */ }
        if (timerId) clearTimeout(timerId)
      }
      window[cbName] = (data) => { cleanup(); resolve(data) }
      const script = document.createElement('script')
      script.id = elId
      const sep = baseURL.includes('?') ? '&' : '?'
      script.src = `${baseURL}${sep}action=getStudentDetails&id=${encodeURIComponent(id)}&callback=${cbName}&_=${Date.now()}`
      script.async = true
      script.onerror = () => { cleanup(); reject(new Error('Script load error')) }
      document.body.appendChild(script)
      timerId = window.setTimeout(() => { cleanup(); reject(new Error('JSONP request timed out')) }, timeoutMs)
    })

    const jobs = toFetch.map(async (id) => {
      fetchedNameIdsRef.current.add(id)
      try {
        const cb = `fee_enrich_${id.replace(/[^a-zA-Z0-9_]/g, '_')}_${Date.now() % 1e6}`
        const elId = `jsonp-fee-enrich-${cb}`
        const data = await fetchDetailsJSONP(id, cb, elId)
        // Expect shape like { found, student: { name, firstName, lastName, applicationId } }
        const s = data && (data.student || data.Student || {})
        let name = pick(s, ['name', 'Name', 'fullName', 'FullName'])
        if (!name) {
          const fn = pick(s, ['firstName', 'FirstName'])
          const ln = pick(s, ['lastName', 'LastName'])
          if (fn || ln) name = [fn, ln].filter(Boolean).join(' ').trim()
        }
        if (name) {
          setNameMap((prev) => ({ ...prev, [id]: name }))
        }
      } catch {
        // ignore enrichment failures
      }
    })

    void Promise.all(jobs)
  }, [transactions])

  const filtered = useMemo(() => {
    const now = new Date()
    const withinRange = (d) => {
      if (!dateRange) return true
      const dt = new Date(d)
      if (isNaN(dt)) return false
      if (dateRange === 'today') {
        const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
        return a.getTime() === b.getTime()
      }
      if (dateRange === 'last-7-days') {
        const start = new Date(now)
        start.setDate(start.getDate() - 7)
        return dt >= start && dt <= now
      }
      if (dateRange === 'last-30-days') {
        const start = new Date(now)
        start.setDate(start.getDate() - 30)
        return dt >= start && dt <= now
      }
      return true
    }

    return transactions.filter((t) => {
      const term = search.trim().toLowerCase()
      const txnId = pick(t, ['TransactionID', 'transactionId', 'txnId', 'TransactionId'])
      const appId = pick(t, ['ApplicationID', 'applicationId', 'ApplicationId'])
      const amount = pick(t, ['Amount', 'amount', 'FeeAmount', 'feeAmount'])
      const pm = pick(t, ['PaymentMethod', 'paymentMethod', 'method'])
      const st = pick(t, ['Status', 'status'])
      const pDate = pick(t, ['PaymentDate', 'paymentDate', 'date', 'timestamp', 'createdAt'])
      const desc = pick(t, ['Description', 'description', 'Notes', 'notes'])
      const enrichedName = pick(t, ['StudentName', 'studentName', 'Student', 'student', 'ApplicantName', 'applicantName', 'Applicant', 'applicant', 'Name', 'name']) || (appId ? nameMap[appId] : '')

      const matchesTerm = !term || [
        txnId,
        appId,
        amount,
        pm,
        st,
        pDate,
        desc,
        enrichedName,
        // legacy
        t.email,
      ]
        .map((x) => String(x || '').toLowerCase())
        .some((s) => s.includes(term))

      const m = String(method || '').toLowerCase()
      const vMethod = String(pm || '').toLowerCase()
      const matchesMethod = !m || vMethod === m

      const s = String(status || '').toLowerCase()
      const vStatus = String(st || '').toLowerCase()
      const matchesStatus = !s || vStatus === s

      const matchesDate = withinRange(pDate)

      return matchesTerm && matchesMethod && matchesStatus && matchesDate
    })
  }, [transactions, search, method, status, dateRange, nameMap])

  const showingText = useMemo(() => {
    const total = filtered.length
    if (total === 0) return 'Showing 0 results'
    return `Showing 1 to ${total} of ${total} results`
  }, [filtered])

  const handleViewReceipt = (t) => {
    const url = t.receiptUrl || t.pdfUrl || t.receiptURL || t.ReceiptUrl || t.ReceiptURL
    if (url) {
      window.open(url, '_blank', 'noopener')
      return
    }
    // Fallback: render a simple printable receipt
    const amount = pick(t, ['Amount', 'amount', 'FeeAmount', 'feeAmount'])
    const method = pick(t, ['PaymentMethod', 'paymentMethod', 'method']) || '—'
    const txn = pick(t, ['TransactionID', 'transactionId', 'txnId', 'TransactionId', 'ApplicationID', 'applicationId']) || '—'
    const date = pick(t, ['PaymentDate', 'paymentDate', 'date', 'timestamp', 'createdAt']) || new Date().toISOString()
    const desc = pick(t, ['Description', 'description', 'Notes', 'notes'])
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${txn}</title></head><body style="font-family:ui-sans-serif,system-ui,Arial;padding:24px;">`+
      `<h2 style="margin:0 0 12px">Fee Receipt</h2>`+
      `<div><strong>Transaction ID:</strong> ${txn}</div>`+
      (desc ? `<div><strong>Description:</strong> ${desc}</div>` : '')+
      (amount != null ? `<div><strong>Amount:</strong> ${amount}</div>` : '')+
      `<div><strong>Payment Method:</strong> ${method}</div>`+
      `<div><strong>Date:</strong> ${new Date(date).toLocaleString()}</div>`+
      `<hr/><p style="font-size:12px;color:#666">System-generated receipt.</p>`+
      `</body></html>`
    const w = window.open('', '_blank')
    if (w) {
      w.document.open(); w.document.write(html); w.document.close(); w.focus(); w.print();
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-80 bg-white border-r border-gray-200 p-6 flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full" />
          <h1 className="text-xl font-bold text-gray-800">College ERP</h1>
        </div>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
          <input className="form-input w-full rounded-md border-gray-200 bg-gray-100 py-2.5 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500"
                 placeholder="Search transactions" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div>
          <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-4">Filters</h3>
          <div className="space-y-4">
            <select className="form-select w-full rounded-md border-gray-200 text-sm text-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Payment Method</option>
              <option value="credit card">Credit Card</option>
              <option value="online banking">Online Banking</option>
              <option value="cash">Cash</option>
            </select>
            <select className="form-select w-full rounded-md border-gray-200 text-sm text-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <select className="form-select w-full rounded-md border-gray-200 text-sm text-gray-700 focus:border-blue-500 focus:ring-blue-500"
                    value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
              <option value="">Date Range</option>
              <option value="today">Today</option>
              <option value="last-7-days">Last 7 Days</option>
              <option value="last-30-days">Last 30 Days</option>
            </select>
            <button className="w-full flex cursor-pointer items-center justify-center rounded-md h-10 px-4 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
                    onClick={() => { setSearch(''); setMethod(''); setStatus(''); setDateRange('') }}>
              <span className="truncate">Clear Filters</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Fee Collection</h2>
          <button className="flex cursor-pointer items-center justify-center gap-2 rounded-md h-10 px-4 bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700"
                  onClick={() => alert('New Transaction flow is not implemented yet')}>
            <span className="material-symbols-outlined">add</span>
            <span className="truncate">New Transaction</span>
          </button>
        </div>

        {message && (
          <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 text-yellow-800 p-3 text-sm">{message}</div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-6 py-4 font-medium">Transaction ID</th>
                  <th className="px-6 py-4 font-medium">Student Name</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Payment Date</th>
                  <th className="px-6 py-4 font-medium">Payment Method</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Description</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12">
                      <div className="flex items-center justify-center">
                        <div className="inline-flex flex-col items-center" role="status" aria-live="polite" aria-busy="true">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                          <div className="mt-3 text-xs text-gray-500">Loading fee data…</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">No transactions found.</td></tr>
                ) : (
                  filtered.map((t, idx) => {
                    const txnId = pick(t, ['TransactionID', 'transactionId', 'txnId', 'TransactionId']) || `TX-${idx+1}`
                    const appId = pick(t, ['ApplicationID', 'applicationId', 'ApplicationId']) || '-'
                    const studentName = pick(t, ['StudentName', 'studentName', 'Student', 'student', 'ApplicantName', 'applicantName', 'Applicant', 'applicant', 'Name', 'name']) || (appId !== '-' ? nameMap[appId] : '')
                    const amount = pick(t, ['Amount', 'amount', 'FeeAmount', 'feeAmount'])
                    const paymentDate = pick(t, ['PaymentDate', 'paymentDate', 'date', 'timestamp', 'createdAt'])
                    const paymentMethod = pick(t, ['PaymentMethod', 'paymentMethod', 'method']) || '-'
                    const st = pick(t, ['Status', 'status'])
                    const b = statusBadge(st)
                    const description = pick(t, ['Description', 'description', 'Notes', 'notes']) || '-'
                    return (
                      <tr key={String(txnId)} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-medium">{txnId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">{studentName || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">{formatAmount(amount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">{paymentDate ? (typeof paymentDate === 'string' ? paymentDate : new Date(paymentDate).toLocaleString()) : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">{paymentMethod}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${b.bg} ${b.text}`}>{b.label}</span>
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate text-gray-600" title={String(description)}>{String(description)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button className="text-blue-600 hover:text-blue-800 font-medium" onClick={() => handleViewReceipt(t)}>View Receipt</button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">{showingText}</p>
            {/* Simple placeholder pagination UI; not functional */}
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">Page 1</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default FeeManagement
