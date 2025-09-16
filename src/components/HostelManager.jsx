import React, { useState, useEffect, useCallback } from 'react';

const HostelManager = () => {
  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [message, setMessage] = useState('');

  const fetchData = useCallback(() => {
    const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL; // unified env var
    if (!baseURL) {
      setMessage('Missing VITE_APPS_SCRIPT_URL in .env');
      setLoading(false);
      return () => {};
    }

    setLoading(true);

    let timerId;
    const callbackName = 'handleHostelData';

    const cleanup = () => {
      const el = document.getElementById('jsonp-hostel-script');
      if (el && el.parentNode) el.parentNode.removeChild(el);
      try { delete window[callbackName]; } catch { /* no-op */ }
      if (timerId) clearTimeout(timerId);
    };

    // JSONP callback
    window[callbackName] = (data) => {
      if (data && data.error) {
        setMessage('Error fetching data: ' + data.error);
      } else if (data) {
        setStudents(Array.isArray(data.students) ? data.students : []);
        setRooms(Array.isArray(data.rooms) ? data.rooms : []);
      } else {
        setMessage('No data returned');
      }
      setLoading(false);
      cleanup();
    };

    const script = document.createElement('script');
    script.id = 'jsonp-hostel-script';
    script.src = `${baseURL}?action=getStudentsAndHostels&callback=${callbackName}&_=${Date.now()}`; // cache-bust
    script.async = true;
    script.onerror = () => {
      setMessage('Failed to load hostel data (script error)');
      setLoading(false);
      cleanup();
    };

    document.body.appendChild(script);

    // Timeout fallback (increase to 12s)
    timerId = window.setTimeout(() => {
      setMessage('Timed out fetching hostel data. Check your Apps Script URL and deployment.');
      setLoading(false);
      cleanup();
    }, 12000);

    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup;
  }, [fetchData]);

  const availableRooms = rooms.filter((room) => room.Status === 'Available');

  const pickRoom = () => {
    if (!availableRooms.length) return null;
    // Prefer the lowest numeric room number if possible
    const sorted = [...availableRooms].sort((a, b) => {
      const an = parseFloat(String(a.RoomNumber).replace(/[^0-9.]/g, ''));
      const bn = parseFloat(String(b.RoomNumber).replace(/[^0-9.]/g, ''));
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return String(a.RoomNumber).localeCompare(String(b.RoomNumber));
    });
    return sorted[0];
  };

  const handleAssignRoom = async () => {
    if (!selectedStudent) {
      setMessage('Please select a student.');
      return;
    }

    const roomToAssign = pickRoom();
    if (!roomToAssign) {
      setMessage('No available rooms to assign.');
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
          action: 'assignHostelRoom',
          studentId: selectedStudent,
          roomNumber: roomToAssign.RoomNumber,
        }),
        headers: { 'Content-Type': 'text/plain' },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Network error: ${response.status} ${response.statusText} - ${text}`);
      }

      const result = await response.json();

      if (result.result === 'success') {
        setMessage(`Assigned Room ${roomToAssign.RoomNumber} to ${selectedStudent}.`);
        // Refresh the data to show the updated room status
        fetchData();
      } else {
        throw new Error(result.message || 'Failed to assign room.');
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !students.length) return <div className="p-8 text-center">Loading Hostel Data...</div>;

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-purple-800 mb-8">Hostel Room Manager</h1>
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Auto-Assign Room</h2>
          {message && <p className="mb-4 text-sm text-center text-gray-600 bg-gray-100 p-2 rounded-md">{message}</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label htmlFor="student" className="block text-sm font-medium text-gray-700">Student Needing Room</label>
              <select id="student" onChange={(e) => setSelectedStudent(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Select a student...</option>
                {students.map((student) => (
                  <option key={student.applicationId} value={student.applicationId}>
                    {student.firstName} {student.lastName} ({student.applicationId})
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-600 mt-2">Available rooms: {availableRooms.length}</div>
            </div>
            <button onClick={handleAssignRoom} disabled={submitting || !students.length || !availableRooms.length} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400">
              {submitting ? 'Assigning...' : 'Auto Assign Room'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostelManager;