import React from 'react';

const Sidebar = () => {
  return (
    <aside className="flex w-64 flex-col bg-white border-r border-gray-200">
      <div className="flex items-center gap-3 px-6 py-4 text-gray-800 border-b border-gray-200">
        <div className="size-8 text-sky-600">
          <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 8L40 24L24 40L8 24L24 8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4"></path>
            <path d="M24 32L16 24L24 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4"></path>
          </svg>
        </div>
        <h2 className="text-gray-900 text-xl font-bold leading-tight tracking-[-0.015em]">College Central</h2>
      </div>
      <nav className="flex-1 space-y-2 p-4">
        <a className="flex items-center gap-3 rounded-md bg-sky-50 px-3 py-2 text-sky-600 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">dashboard</span>
          Dashboard
        </a>
        <a className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">school</span>
          Admissions
        </a>
        <a className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">payments</span>
          Fee Management
        </a>
        <a className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">night_shelter</span>
          Hostel Allocation
        </a>
        <a className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">history_edu</span>
          Examination Records
        </a>
        <a className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">assessment</span>
          Reports
        </a>
      </nav>
      <div className="p-4 border-t border-gray-200">
        <a className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">settings</span>
          Settings
        </a>
        <a className="flex items-center gap-3 rounded-md px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 text-sm font-medium" href="#">
          <span className="material-symbols-outlined">logout</span>
          Logout
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;