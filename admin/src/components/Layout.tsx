import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { t } from "../lib/i18n";
import { useAdminAuth } from '../auth';
interface LayoutProps {
    children: ReactNode;
}
export default function Layout({ children }: LayoutProps) {
    const location = useLocation();
    const { user, logout } = useAdminAuth();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const handleLogout = async () => {
        await logout();
    };
    const navigation = [
        { name: 'Dashboard', href: '/' },
        { name: t("admin.components.layout.clients"), href: '/customers' },
        { name: t("admin.components.layout.carts"), href: '/carts' },
        { name: t("admin.components.layout.orders"), href: '/orders' },
        { name: t("admin.components.layout.shipments"), href: '/shipments' },
        { name: t("admin.components.layout.emails"), href: '/emails' },
        { name: t("admin.components.layout.automation_jobs"), href: '/automation-jobs' },
        { name: t("admin.components.layout.discounts"), href: '/discounts' },
        { name: t("admin.components.layout.ingredients"), href: '/ingredients' },
        { name: t("admin.components.layout.products"), href: '/products' },
        { name: t("admin.components.layout.blends"), href: '/blend-listings' },
        { name: t("admin.components.layout.packs"), href: '/packs' },
        { name: t("admin.components.layout.subscriptions"), href: '/subscription-plans' },
        { name: t("admin.components.layout.redirections"), href: '/redirect-rules' },
        { name: t("admin.components.layout.translations"), href: '/translations' },
        { name: t("admin.components.layout.settings_store"), href: '/settings' },
    ];
    return (<div className="admin-layout">
      <aside className={`admin-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="admin-sidebar-top">
          <div className="admin-sidebar-header">
            <h1 className="admin-brand">My Own Tea</h1>
            <button type="button" className="admin-sidebar-toggle" onClick={() => setIsSidebarCollapsed((prev) => !prev)} aria-label={isSidebarCollapsed ? t("admin.components.layout.expand_menu") : t("admin.components.layout.collapse_menu")} title={isSidebarCollapsed ? t("admin.components.layout.expand_menu") : t("admin.components.layout.collapse_menu")}>
              {isSidebarCollapsed ? '>' : '<'}
            </button>
          </div>
          <nav className="admin-nav">
            {navigation.map((item) => (<Link key={item.href} to={item.href} className={`admin-link ${location.pathname === item.href ? 'active' : ''}`}>
                <span className="admin-link-text">{item.name}</span>
              </Link>))}
          </nav>
        </div>
        <div className="admin-sidebar-footer">
          <p className="admin-sidebar-welcome">Bienvenue, {user?.email || 'Admin'}</p>
          <button onClick={() => void handleLogout()} className="admin-btn admin-btn-danger admin-sidebar-logout" type="button">
            <span className="admin-sidebar-logout-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 8l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>{t("admin.components.layout.logout")}</span>
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-main-content">{children}</div>
      </main>
    </div>);
}
