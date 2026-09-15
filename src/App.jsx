import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { Menu } from 'lucide-react';

import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GuestList from './pages/GuestList';
import Tables from './pages/Tables';
import CheckIns from './pages/CheckIns';
import Settings from './pages/Settings';
import ScanPage from './pages/ScanPage';
import FloorPlan from './pages/FloorPlan';
import AdminAlbum from './pages/AdminAlbum';
import Messages from './pages/Messages';

function AdminLayout({ children, user }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (user === undefined) {
    return <div className="empty-state">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setIsMenuOpen(true)} aria-label="Open menu">
          <Menu />
        </button>
        <div className="mobile-topbar-title">Party Admin</div>
      </div>

      {isMenuOpen && <div className="sidebar-overlay" onClick={() => setIsMenuOpen(false)} />}

      <Sidebar
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
      />

      <main className={'main-content' + (isCollapsed ? ' sidebar-collapsed' : '')}>
        {children}
      </main>
    </div>
  );
}

function HomeRedirect({ user }) {
  if (user === undefined) {
    return <div className="empty-state">Loading...</div>;
  }
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  return (
    <Routes>
      {/* Opening the site with no path goes to admin login (or dashboard if already signed in) */}
      <Route path="/" element={<HomeRedirect user={user} />} />

      {/* Guest-facing route, only reached by scanning the QR code */}
      <Route path="/checkin" element={<ScanPage />} />

      {/* Admin routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<AdminLayout user={user}><Dashboard /></AdminLayout>} />
      <Route path="/guest-list" element={<AdminLayout user={user}><GuestList /></AdminLayout>} />
      <Route path="/tables" element={<AdminLayout user={user}><Tables /></AdminLayout>} />
      <Route path="/checkins" element={<AdminLayout user={user}><CheckIns /></AdminLayout>} />
      <Route path="/floor-plan-admin" element={<AdminLayout user={user}><FloorPlan /></AdminLayout>} />
      <Route path="/album" element={<AdminLayout user={user}><AdminAlbum /></AdminLayout>} />
      <Route path="/messages" element={<AdminLayout user={user}><Messages /></AdminLayout>} />
      <Route path="/settings" element={<AdminLayout user={user}><Settings /></AdminLayout>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
