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

  const availableRooms = rooms.filter((room) => String(room.Status).toLowerCase() === 'available');

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

  // Assign a specific room from the table
  const handleAssignRoomTo = async (roomNumber) => {
    if (!selectedStudent) {
      setMessage('Please select a student first (left panel).');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const baseURL = import.meta.env.VITE_APPS_SCRIPT_URL;
      if (!baseURL) throw new Error('Missing VITE_APPS_SCRIPT_URL');
      const response = await fetch(baseURL, {
        method: 'POST',
        body: JSON.stringify({ action: 'assignHostelRoom', studentId: selectedStudent, roomNumber }),
        headers: { 'Content-Type': 'text/plain' },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Network error: ${response.status} ${response.statusText} - ${text}`);
      }
      const result = await response.json();
      if (result.result === 'success') {
        setMessage(`Assigned Room ${roomNumber} to ${selectedStudent}.`);
        fetchData();
      } else {
        throw new Error(result.message || 'Failed to assign room.');
      }
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const occupiedCount = rooms.filter(r => String(r.Status).toLowerCase() === 'occupied').length;
  const vacantCount = rooms.filter(r => String(r.Status).toLowerCase() === 'available').length;

  const statusInfo = (s) => {
    const v = String(s || '').toLowerCase();
    if (v === 'occupied') return { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Occupied' };
    if (v === 'available') return { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', label: 'Vacant' };
    return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400', label: s || 'Unknown' };
  };

  const formatInitials = (name) => {
    if (!name) return '-';
    const parts = String(name).trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts[parts.length - 1]?.[0] || '';
    return (first + last).toUpperCase();
  };

  if (loading && !students.length) return (
    <div className="p-8 flex items-center justify-center">
      <div className="inline-flex flex-col items-center" role="status" aria-live="polite" aria-busy="true">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <div className="mt-3 text-sm text-gray-500">Loading hostel data…</div>
      </div>
    </div>
  );

  return (
    <div className="">
      {message && (
        <p className="mb-4 text-sm text-center text-gray-700 bg-yellow-50 border border-yellow-200 p-2 rounded-md">{message}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
        {/* Left filter/legend panel */}
        <aside className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-white">night_shelter</span>
              </div>
              <h2 className="text-lg font-bold text-gray-800">HostelMS</h2>
            </div>

            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Filters</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="block">Block</label>
                <select id="block" name="block" className="form-select w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                  <option value="">All Blocks</option>
                  <option>Block A</option>
                  <option>Block B</option>
                  <option>Block C</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="floor">Floor</label>
                <select id="floor" name="floor" className="form-select w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                  <option value="">All Floors</option>
                  <option>Floor 1</option>
                  <option>Floor 2</option>
                  <option>Floor 3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="student">Student Needing Room</label>
                <select id="student" onChange={(e) => setSelectedStudent(e.target.value)} className="form-select w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                  <option value="">Select a student...</option>
                  {students.map((student) => (
                    <option key={student.applicationId} value={student.applicationId}>
                      {student.firstName} {student.lastName} ({student.applicationId})
                    </option>
                  ))}
                </select>
                <div className="text-xs text-gray-600 mt-2">Available rooms: {availableRooms.length}</div>
              </div>
              <button className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2" onClick={() => { /* presentational filter button */ }}>
                <span className="material-symbols-outlined text-xl">filter_alt</span>
                Apply Filters
              </button>
            </div>

            <hr className="my-6 border-gray-200" />
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Legend</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-red-500"></div>
                  <span className="text-gray-700">Occupied</span>
                </div>
                <span className="font-semibold text-gray-800">{occupiedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-green-500"></div>
                  <span className="text-gray-700">Vacant</span>
                </div>
                <span className="font-semibold text-gray-800">{vacantCount}</span>
              </div>
            </div>
          </div>
          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">© {new Date().getFullYear()} College ERP</p>
          </div>
        </aside>

        {/* Right content: header + table */}
        <section className="">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Hostel Rooms</h1>
            <div className="flex items-center gap-4">
              <button onClick={handleAssignRoom} disabled={submitting || !students.length || !availableRooms.length} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:bg-gray-400">
                <span className="material-symbols-outlined">add</span>
                {submitting ? 'Assigning...' : 'Allocate Room'}
              </button>
              <div className="relative">
                <input className="form-input rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500" placeholder="Search rooms or students..." type="text" />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
              </div>
            </div>
          </header>

          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Room</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Student</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rooms
                  .slice()
                  .sort((a, b) => String(a.RoomNumber).localeCompare(String(b.RoomNumber), undefined, { numeric: true }))
                  .map((room) => {
                    const info = statusInfo(room.Status);
                    const studentName = room.StudentName || room.Student || room.AssignedTo || '';
                    const studentId = room.StudentId || room.ApplicationId || '';
                    const isVacant = String(room.Status).toLowerCase() === 'available';
                    return (
                      <tr key={String(room.RoomNumber)}>
                        <td className="p-4 whitespace-nowrap">
                          <div className="font-semibold text-gray-900">{room.RoomNumber}</div>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${info.bg} ${info.text}`}>
                            <span className={`w-2 h-2 mr-2 rounded-full ${info.dot}`}></span>
                            {info.label}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          {isVacant ? (
                            <span className="text-gray-500">-</span>
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                                {formatInitials(studentName)}
                              </div>
                              <div>
                                <div className="font-medium text-gray-800">{studentName || 'Assigned'}</div>
                                {studentId ? <div className="text-sm text-gray-500">ID: {studentId}</div> : null}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          {isVacant ? (
                            <button onClick={() => handleAssignRoomTo(room.RoomNumber)} disabled={submitting} className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 disabled:text-gray-400">
                              <span className="material-symbols-outlined text-lg">person_add</span> Allocate
                            </button>
                          ) : (
                            <button className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
                              <span className="material-symbols-outlined text-lg">visibility</span> View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HostelManager;