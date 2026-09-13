import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { Gauge, ListChecks, LayoutGrid, ClipboardList, MapPin, Settings, ArrowLeft, X } from 'lucide-react';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/guest-list', label: 'Guest List', icon: ListChecks },
  { to: '/tables', label: 'Tables', icon: LayoutGrid },
  { to: '/checkins', label: 'Check-Ins', icon: ClipboardList },
  { to: '/floor-plan-admin', label: 'Floor Plan', icon: MapPin },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  // On a phone, close the menu once a page is picked
  function handleLinkClick() {
    if (onClose) onClose();
  }

  return (
    <aside className={'sidebar' + (isOpen ? ' open' : '') + (isCollapsed ? ' collapsed' : '')}>
      <div className="sidebar-top">
        <button
          type="button"
          className="sidebar-title"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
          title={isCollapsed ? 'Expand menu' : 'Collapse menu'}
        ></button>
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
          <X />
        </button>
      </div>
      <div className="sidebar-divider" />
      <nav className="sidebar-nav">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={handleLinkClick}
            className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
          >
            <Icon />
            <span className="sidebar-label">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button onClick={handleLogout} className="sidebar-link" style={{ width: '100%', background: 'none', border: 'none', borderLeft: '3px solid transparent' }}>
          <ArrowLeft />
          <span className="sidebar-label">Log Out</span>
        </button>
      </div>
    </aside>
  );
}
