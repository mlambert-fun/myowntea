import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('user');
    window.location.href = 'http://localhost:5000/';
  };

  const navigation = [
    { name: 'Dashboard', href: '/' },
    { name: 'Clients', href: '/customers' },
    { name: 'Paniers', href: '/carts' },
    { name: 'Commandes', href: '/orders' },
    { name: 'Expéditions', href: '/shipments' },
    { name: 'Emails', href: '/emails' },
    { name: 'Jobs automatiques', href: '/automation-jobs' },
    { name: 'Réductions', href: '/discounts' },
    { name: 'Ingrédients', href: '/ingredients' },
    { name: 'Produits', href: '/products' },
    { name: 'Créations', href: '/blend-listings' },
    { name: 'Packs', href: '/packs' },
    { name: 'Abonnements', href: '/subscription-plans' },
    { name: 'Paramètres boutique', href: '/settings' },
  ];

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="admin-sidebar-top">
          <div className="admin-sidebar-header">
            <h1 className="admin-brand">My Own Tea</h1>
            <button
              type="button"
              className="admin-sidebar-toggle"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? 'Déplier le menu' : 'Plier le menu'}
              title={isSidebarCollapsed ? 'Déplier le menu' : 'Plier le menu'}
            >
              {isSidebarCollapsed ? '>' : '<'}
            </button>
          </div>
          <nav className="admin-nav">
            {navigation.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`admin-link ${location.pathname === item.href ? 'active' : ''}`}
              >
                <span className="admin-link-text">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="admin-sidebar-footer">
          <p className="admin-sidebar-welcome">Bienvenue, {user.email || 'Admin'}</p>
          <button onClick={handleLogout} className="admin-btn admin-btn-danger admin-sidebar-logout" type="button">
            <span className="admin-sidebar-logout-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 12h10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M17 8l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Se déconnecter
            </span>
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-main-content">{children}</div>
      </main>
    </div>
  );
}
