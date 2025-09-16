import { NavLink, Outlet } from 'react-router-dom'

export default function AppLayout({ user, onLogout }) {
  const linkBase = 'px-3 py-2 rounded-md text-sm font-medium border';
  const active = 'bg-blue-600 text-white border-blue-600';
  const inactive = 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/vite.svg" className="h-6" alt="logo" />
            <h1 className="text-lg font-semibold">College ERP</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">{user?.name || 'User'}</span>
            <button onClick={onLogout} className="rounded bg-gray-800 text-white px-3 py-1.5 hover:bg-black">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 mb-4">
          <NavLink to="/dashboard" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`} end>Dashboard</NavLink>
          <NavLink to="/admissions" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Admissions</NavLink>
          <NavLink to="/hostel" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Hostel</NavLink>
          <NavLink to="/library" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Library</NavLink>
          <NavLink to="/student" className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}>Student</NavLink>
        </div>

        <div className="bg-white border rounded-lg">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
