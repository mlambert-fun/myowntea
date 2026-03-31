import { ChevronRight, Printer } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Navigation } from '@/sections/Navigation';
import { Footer } from '@/sections/Footer';
import { useAuth } from '@/context/AuthContext';
import { useBlend } from '@/context/BlendContext';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { t } from "@/lib/i18n";

const navItems = [
    { label: t("app.components.account.account_layout.dashboard"), to: '/account' },
    { label: t("app.components.account.account_layout.my_informations"), to: '/account/edit' },
    { label: t("app.components.account.account_layout.my_orders"), to: '/account/orders' },
    { label: t("app.components.account.account_layout.my_addresses"), to: '/account/address' },
    { label: t("app.components.account.account_layout.my_subscriptions"), to: '/account/subscriptions' },
];

const formatName = (firstName?: string | null, email?: string | null) => {
    if (firstName)
        return firstName;
    if (email)
        return email.split('@')[0];
    return 'Client';
};

export function AccountLayout() {
    const { customer, logout } = useAuth();
    const { openWishlistDrawer } = useBlend();
    const navigate = useNavigate();
    const location = useLocation();
    const isInvoicePage = /\/account\/order\/[^/]+\/invoice$/.test(location.pathname);

    return (
        <div className="min-h-screen bg-[var(--cream-apothecary)]">
            <Navigation />
            <main className="pt-28 pb-16">
                <div className="mx-auto max-w-6xl px-6">
                    <PageBreadcrumb />
                    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="text-sm text-[var(--sage-deep)]/60">Espace client</p>
                            <h1 className="font-display text-3xl text-[var(--sage-deep)]">
                                Bonjour {formatName(customer?.firstName, customer?.email)}
                            </h1>
                        </div>
                        {isInvoicePage && (
                            <div className="invoice-print-actions flex justify-end">
                                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => window.print()}>
                                    <Printer className="h-4 w-4" />
                                    {t("app.sections.account.account_invoice.print_invoice")}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
                        <aside className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow">
                            <nav className="space-y-2">
                                {navItems.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={item.to === '/account'}
                                        className={({ isActive }) => `flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition ${isActive
                                            ? 'bg-[var(--sage-deep)] text-white'
                                            : 'text-[var(--sage-deep)]/70 hover:bg-[#F6F2EA] hover:text-[var(--sage-deep)]'}`}
                                    >
                                        {item.label}
                                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                    </NavLink>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => openWishlistDrawer()}
                                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-[var(--sage-deep)]/70 transition hover:bg-[#F6F2EA] hover:text-[var(--sage-deep)]"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <Heart className="h-4 w-4" aria-hidden="true" />
                                        {t("app.components.account.account_layout.my_wishlist")}
                                    </span>
                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </nav>
                            <div className="mt-4 border-t border-[#EEE6D8] pt-4">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await logout();
                                        navigate('/logout');
                                    }}
                                    className="w-full rounded-xl border border-[#EEE6D8] px-4 py-3 text-sm font-medium text-[var(--gold-antique)] transition hover:border-[var(--gold-antique)]"
                                >
                                    <span className="inline-flex items-center justify-center gap-2">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M10 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M17 8l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        {t("app.components.account.account_layout.logout")}
                                    </span>
                                </button>
                            </div>
                        </aside>
                        <section className="min-w-0">
                            <Outlet />
                        </section>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
