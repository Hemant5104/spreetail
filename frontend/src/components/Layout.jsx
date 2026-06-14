import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, Receipt, Upload, ArrowRightLeft, LogOut } from 'lucide-react';

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/groups', label: 'Groups', icon: Users },
    { path: '/expenses', label: 'Expenses', icon: Receipt },
    { path: '/balances', label: 'Balances', icon: ArrowRightLeft },
    { path: '/import', label: 'Import CSV', icon: Upload },
    { path: '/settlements', label: 'Settlements', icon: ArrowRightLeft },
  ];

  return (
    <div className="nav-layout">
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-logo">
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="14" fill="url(#auth-logo-grad)"/>
              <path d="M8 14.5C8 11.5 10 9 14 9C18 9 20 11.5 20 14.5C20 17.5 18 20 14 20C10 20 8 17.5 8 14.5Z" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M12 13V16M16 13V16M11 14.5H17" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
              <defs>
                <linearGradient id="auth-logo-grad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#6366f1"/>
                  <stop offset="1" stopColor="#8b5cf6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="nav-title">Spreetail</div>
        </div>

        <div className="nav-links">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="nav-user">
          <div className="nav-user-avatar">
            {user?.display_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="nav-user-name" title={user?.display_name}>
            {user?.display_name}
          </div>
          <button onClick={logout} className="btn-icon" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className="main-content">
        <div className="main-content-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
