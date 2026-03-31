import { useEffect, useState } from 'react';
import { Heart, UserCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useBlend } from '@/context/BlendContext';
import { t } from "@/lib/i18n";
interface AccountDrawerProps {
    open: boolean;
    onClose: () => void;
}
export function AccountDrawer({ open, onClose }: AccountDrawerProps) {
    const { customer, logout } = useAuth();
    const { openWishlistDrawer } = useBlend();
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const navigate = useNavigate();
    const [hasSubscriptions, setHasSubscriptions] = useState(false);
    const customerLabel = customer?.firstName || customer?.email || t("app.components.login_drawer.account_drawer.customer");
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);
    useEffect(() => {
        if (!open || !customer?.email) {
            setHasSubscriptions(false);
            return;
        }
        let active = true;
        api.getAccountSubscriptions()
            .then((response) => {
            if (!active)
                return;
            setHasSubscriptions(Array.isArray(response?.subscriptions) && response.subscriptions.length > 0);
        })
            .catch(() => {
            if (!active)
                return;
            setHasSubscriptions(false);
        });
        return () => {
            active = false;
        };
    }, [customer?.email, open]);
    return (<div className={`fixed inset-0 z-[510] ${open ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 cursor-close-cross ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}/>
      <aside className={`absolute right-0 top-0 h-full w-full sm:w-[480px] bg-white shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`} onClick={(event) => event.stopPropagation()}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#EEE6D8]">
            <div className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-[var(--sage-deep)]"/>
              <h3 className="font-display text-xl text-[var(--sage-deep)]">
                {t("app.components.login_drawer.account_drawer.hello_name", undefined, { name: customerLabel })}
              </h3>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-[var(--sage-deep)]/70 hover:text-[var(--sage-deep)] hover:bg-[#F3F1EE] transition" aria-label={t("app.components.login_drawer.account_drawer.close")}>
              <X className="w-4 h-4"/>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            <button className="w-full text-left px-4 py-3 rounded-xl border border-[#EEE6D8] hover:border-[var(--gold-antique)] transition-colors" onClick={() => {
            window.location.href = '/account';
        }}>{t("app.components.login_drawer.account_drawer.my_account")}</button>
            <div className="grid gap-2 pl-2">
              <button className="w-full text-left px-4 py-2 rounded-xl border border-[#EEE6D8] hover:border-[var(--gold-antique)] transition-colors text-sm text-[var(--sage-deep)]/80" onClick={() => {
            window.location.href = '/account/edit';
        }}>{t("app.components.login_drawer.account_drawer.my_informations")}</button>
              <button className="w-full text-left px-4 py-2 rounded-xl border border-[#EEE6D8] hover:border-[var(--gold-antique)] transition-colors text-sm text-[var(--sage-deep)]/80" onClick={() => {
            window.location.href = '/account/orders';
        }}>{t("app.components.login_drawer.account_drawer.my_orders")}</button>
              <button className="w-full text-left px-4 py-2 rounded-xl border border-[#EEE6D8] hover:border-[var(--gold-antique)] transition-colors text-sm text-[var(--sage-deep)]/80" onClick={() => {
            window.location.href = '/account/address';
        }}>{t("app.components.login_drawer.account_drawer.my_addresses")}</button>
              <button className="w-full text-left px-4 py-2 rounded-xl border border-[#EEE6D8] hover:border-[var(--gold-antique)] transition-colors text-sm text-[var(--sage-deep)]/80" onClick={() => {
            window.location.href = hasSubscriptions ? '/account/subscriptions' : '/subscriptions';
        }}>{hasSubscriptions
            ? t("app.components.login_drawer.account_drawer.my_subscriptions")
            : t("app.components.login_drawer.account_drawer.subscriptions_offer")}</button>
              <button className="w-full text-left px-4 py-2 rounded-xl border border-[#EEE6D8] hover:border-[var(--gold-antique)] transition-colors text-sm text-[var(--sage-deep)]/80" onClick={() => {
            onClose();
            openWishlistDrawer();
        }}>
                <span className="inline-flex items-center gap-2">
                  <Heart className="h-4 w-4" aria-hidden="true"/>
                  {t("app.components.login_drawer.account_drawer.my_wishlist")}
                </span>
              </button>
            </div>

            {!customer && (<button type="button" onClick={() => {
                window.location.href = `${apiBaseUrl}/auth/google/start`;
            }} className="w-full btn-secondary flex items-center justify-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.62l6.85-6.85C35.9 2.44 30.36 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.5 13.08 17.77 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.94c-.58 3.12-2.32 5.77-4.94 7.56l7.56 5.87C44.09 37.98 46.98 31.79 46.98 24.55z"/>
                    <path fill="#FBBC05" d="M10.54 28.59c-.48-1.42-.76-2.94-.76-4.59s.27-3.17.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.98-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.36 0 11.7-2.1 15.6-5.7l-7.56-5.87c-2.1 1.41-4.79 2.25-8.04 2.25-6.23 0-11.5-3.58-13.46-8.69l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                </span>{t("app.components.login_drawer.account_drawer.continue_with_google")}</button>)}

            <button className="w-full text-left px-4 py-3 rounded-xl border border-[#EEE6D8] hover:border-[var(--gold-antique)] transition-colors text-[var(--gold-antique)]" onClick={async () => {
            onClose();
            await logout();
            navigate('/logout');
        }}>
              <span className="inline-flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M17 8l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>{t("app.components.login_drawer.account_drawer.logout")}</span>
            </button>
          </div>
        </div>
      </aside>
    </div>);
}
