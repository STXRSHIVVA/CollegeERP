import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const LibraryManager = () => {
  const [students, setStudents] = useState([]);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedBookToIssue, setSelectedBookToIssue] = useState('');
  const [selectedBookToReturn, setSelectedBookToReturn] = useState('');

  const requestIdRef = useRef(0);

  const fetchData = useCallback(() => {
    const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL;
    const currentId = ++requestIdRef.current;

    if (!baseURL) {
      setMessage('Missing VITE_APPS_SCRIPT_URL in .env');
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    setMessage('');

    const callbackName = `handleLibraryData_${currentId}`;
    const scriptId = `jsonp-library-script-${currentId}`;

    let timerId;

    const cleanup = () => {
      const el = document.getElementById(scriptId);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      try { delete window[callbackName]; } catch { /* no-op */ }
      if (timerId) clearTimeout(timerId);
    };

    window[callbackName] = (data) => {
      if (requestIdRef.current !== currentId) {
        cleanup();
        return; // stale response
      }
      if (data && data.error) {
        setMessage('Error fetching data: ' + data.error);
      } else if (data) {
        setStudents(Array.isArray(data.students) ? data.students : []);
        setBooks(Array.isArray(data.books) ? data.books : []);
      } else {
        setMessage('No data returned');
      }
      setLoading(false);
      cleanup();
    };

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `${baseURL}?action=getStudentsAndLibrary&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      if (requestIdRef.current === currentId) {
        setMessage('Failed to load library data (script error)');
        setLoading(false);
      }
      cleanup();
    };

    document.body.appendChild(script);

    // Timeout (increase to 12s)
    timerId = window.setTimeout(() => {
      if (requestIdRef.current === currentId) {
        setMessage('Timed out fetching library data. Check Apps Script URL/deployment.');
        setLoading(false);
      }
      cleanup();
    }, 12000);

    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup;
  }, [fetchData]);

  const availableBooks = useMemo(() => books.filter(b => b.Status === 'Available'), [books]);
  const issuedBooks = useMemo(() => books.filter(b => b.Status === 'Issued'), [books]);

  const handleIssueBook = async () => {
    if (!selectedStudent || !selectedBookToIssue) {
      setMessage('Select a student and a book to issue.');
      return;
    }
    setSubmitting(true);
    setMessage('');

    try {
      const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL;
      if (!baseURL) throw new Error('Missing VITE_APPS_SCRIPT_URL');

      const response = await fetch(baseURL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'issueBook',
          studentId: selectedStudent,
          bookId: selectedBookToIssue,
        }),
        headers: { 'Content-Type': 'text/plain' },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Network error: ${response.status} ${response.statusText} - ${text}`);
      }

      const result = await response.json();
      if (result.result === 'success') {
        setMessage(result.message || 'Book issued successfully.');
        setSelectedBookToIssue('');
        // Refresh
        fetchData();
      } else {
        throw new Error(result.message || 'Failed to issue book.');
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnBook = async () => {
    if (!selectedBookToReturn) {
      setMessage('Select a book to return.');
      return;
    }
    setSubmitting(true);
    setMessage('');

    try {
      const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL;
      if (!baseURL) throw new Error('Missing VITE_APPS_SCRIPT_URL');

      const response = await fetch(baseURL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'returnBook',
          bookId: selectedBookToReturn,
        }),
        headers: { 'Content-Type': 'text/plain' },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Network error: ${response.status} ${response.statusText} - ${text}`);
      }

      const result = await response.json();
      if (result.result === 'success') {
        setMessage(result.message || 'Book returned successfully.');
        setSelectedBookToReturn('');
        // Refresh
        fetchData();
      } else {
        throw new Error(result.message || 'Failed to return book.');
      }
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !students.length) return <div className="p-8 text-center">Loading Library Data...</div>;

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-purple-800 mb-6">Library Manager</h1>
        {message && <p className="mb-4 text-sm text-center text-gray-700 bg-gray-100 p-2 rounded-md">{message}</p>}

        <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
          <h2 className="text-xl font-semibold mb-4">Issue Book</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="lib-student" className="block text-sm font-medium text-gray-700">Student</label>
              <select id="lib-student" value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Select a student...</option>
                {students.map((s) => (
                  <option key={s.applicationId} value={s.applicationId}>
                    {s.firstName} {s.lastName} ({s.applicationId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lib-book-issue" className="block text-sm font-medium text-gray-700">Available Books</label>
              <select id="lib-book-issue" value={selectedBookToIssue} onChange={(e) => setSelectedBookToIssue(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Select a book...</option>
                {availableBooks.map((b) => (
                  <option key={b.BookId} value={b.BookId}>
                    {b.Title ? `${b.Title} (ID: ${b.BookId})` : `ID: ${b.BookId}`}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={handleIssueBook} disabled={submitting} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400">
              {submitting ? 'Issuing...' : 'Issue Book'}
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Return Book</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label htmlFor="lib-book-return" className="block text-sm font-medium text-gray-700">Issued Books</label>
              <select id="lib-book-return" value={selectedBookToReturn} onChange={(e) => setSelectedBookToReturn(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Select a book to return...</option>
                {issuedBooks.map((b) => (
                  <option key={b.BookId} value={b.BookId}>
                    {b.Title ? `${b.Title} (ID: ${b.BookId})` : `ID: ${b.BookId}`} {b.AssignedToStudentId ? `- Issued to ${b.AssignedToStudentId}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={handleReturnBook} disabled={submitting} className="bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400">
              {submitting ? 'Returning...' : 'Return Book'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibraryManager;
