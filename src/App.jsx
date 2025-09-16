import { useState, useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import LoginPage from "./pages/LoginPage.jsx"
import AppLayout from "./routes/AppLayout.jsx"
import DashboardRoute from "./routes/Dashboard.jsx"
import AdmissionsRoute from "./routes/Admissions.jsx"
import HostelRoute from "./routes/Hostel.jsx"
import LibraryRoute from "./routes/Library.jsx"
import StudentRoute from "./routes/Student.jsx"

function App() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    // Restore login from localStorage
    const raw = localStorage.getItem('erp_user')
    if (raw) {
      try { setUser(JSON.parse(raw)) } catch (e) { console.warn('Failed to parse erp_user', e) }
    }
  }, [])

  const handleLogin = (u) => {
    setUser(u)
    localStorage.setItem('erp_user', JSON.stringify(u))
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('erp_user')
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout user={user} onLogout={handleLogout} />}> 
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="/admissions" element={<AdmissionsRoute />} />
          <Route path="/hostel" element={<HostelRoute />} />
          <Route path="/library" element={<LibraryRoute />} />
          <Route path="/student" element={<StudentRoute />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
