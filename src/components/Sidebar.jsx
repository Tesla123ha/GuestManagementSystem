import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { Gauge, ListChecks, LayoutGrid, ClipboardList, MapPin, Settings, ArrowLeft } from 'lucide-react';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/guest-list', label: 'Guest List', icon: ListChecks },
  { to: '/tables', label: 'Tables', icon: LayoutGrid },
  { to: '/checkins', label: 'Check-Ins', icon: ClipboardList },
  { to: '/floor-plan-admin', label: 'Floor Plan', icon: MapPin },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Party Admin</div>
      <div className="sidebar-divider" />
      <nav className="sidebar-nav">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button onClick={handleLogout} className="sidebar-link" style={{ width: '100%', background: 'none', border: 'none', borderLeft: '3px solid transparent' }}>
          <ArrowLeft />
          Log Out
        </button>
      </div>
    </aside>
  );
}
