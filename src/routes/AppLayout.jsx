import { NavLink, Outlet } from 'react-router-dom'

export default function AppLayout({ user, onLogout }) {
  const navBase = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium';
  const navActive = 'bg-primary-50 text-primary-600';
  const navInactive = 'text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900';

  return (
    <div className="bg-secondary-50 min-h-screen font-sans">
      <div className="relative flex min-h-screen w-full overflow-x-hidden">
        {/* Sidebar */}
        <aside className="flex w-64 flex-col bg-white border-r border-secondary-200" aria-label={`Signed in as ${user?.name || user?.email || 'User'}`}>
          <div className="flex items-center gap-3 px-6 py-4 text-secondary-800 border-b border-secondary-200">
            <div className="size-8 text-primary-600">
              <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 8L40 24L24 40L8 24L24 8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4"></path>
                <path d="M24 32L16 24L24 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4"></path>
              </svg>
            </div>
            <h2 className="text-secondary-900 text-xl font-bold leading-tight tracking-[-0.015em]">College Central</h2>
          </div>

          <nav className="flex-1 space-y-2 p-4">
            <NavLink to="/dashboard" end className={({ isActive }) => `${navBase} ${isActive ? navActive : navInactive}`}>
              <span className="material-symbols-outlined">dashboard</span>
              Dashboard
            </NavLink>
            <NavLink to="/admissions" className={({ isActive }) => `${navBase} ${isActive ? navActive : navInactive}`}>
              <span className="material-symbols-outlined">school</span>
              Admissions
            </NavLink>
            <NavLink to="/fees" className={({ isActive }) => `${navBase} ${isActive ? navActive : navInactive}`}>
              <span className="material-symbols-outlined">payments</span>
              Fee Management
            </NavLink>
            <NavLink to="/hostel" className={({ isActive }) => `${navBase} ${isActive ? navActive : navInactive}`}>
              <span className="material-symbols-outlined">night_shelter</span>
              Hostel Allocation
            </NavLink>
            <NavLink to="/library" className={({ isActive }) => `${navBase} ${isActive ? navActive : navInactive}`}>
              <span className="material-symbols-outlined">history_edu</span>
              Library
            </NavLink>
            <NavLink to="/student" className={({ isActive }) => `${navBase} ${isActive ? navActive : navInactive}`}>
              <span className="material-symbols-outlined">badge</span>
              Student
            </NavLink>
          </nav>

          <div className="p-4 border-t border-secondary-200">
            <div className="mb-2 text-xs text-secondary-500 truncate" title={user?.email || user?.name || ''}>
              Signed in as <span className="font-medium text-secondary-800">{user?.name || user?.email || 'User'}</span>
            </div>
            <a className={`${navBase} ${navInactive}`} href="#">
              <span className="material-symbols-outlined">settings</span>
              Settings
            </a>
            <button onClick={onLogout} className={`${navBase} ${navInactive} w-full text-left`}>
              <span className="material-symbols-outlined">logout</span>
              Logout
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1">
          <main className="flex-1 px-8 py-8 md:px-12 lg:px-16">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
