import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { t } from "@/lib/i18n";
type BreadcrumbItem = {
    label: string;
    href?: string;
};
const staticPageLabelMap: Record<string, string> = {
    login: t("app.components.routing.page_breadcrumb.login"),
    'forgot-password': t("app.components.routing.page_breadcrumb.password_oublie"),
    'login-error': t("app.components.routing.page_breadcrumb.login_error"),
    'reset-password': t("app.components.routing.page_breadcrumb.new_password"),
    register: t("app.components.routing.page_breadcrumb.signup"),
    logout: t("app.components.routing.page_breadcrumb.logout"),
    cart: t("app.components.routing.page_breadcrumb.cart"),
    checkout: t("app.components.routing.page_breadcrumb.shipping_payment"),
    'livraison-retours': t("app.components.routing.page_breadcrumb.shipping_retours"),
    'conditions-generales': t("app.components.routing.page_breadcrumb.terms_general"),
    'politique-confidentialite': t("app.components.routing.page_breadcrumb.politique_privacy"),
    faq: t("app.components.routing.page_breadcrumb.faq"),
    contact: t("app.components.routing.page_breadcrumb.contact"),
    subscriptions: t("app.components.routing.page_breadcrumb.subscriptions"),
    order: t("app.components.routing.page_breadcrumb.confirmation"),
    account: t("app.components.routing.page_breadcrumb.my_account"),
    address: t("app.components.routing.page_breadcrumb.addresses"),
    orders: t("app.components.routing.page_breadcrumb.orders"),
    edit: t("app.components.routing.page_breadcrumb.informations"),
    invoice: t("app.components.routing.page_breadcrumb.invoice"),
};
const formatSlugLabel = (slug: string) => decodeURIComponent(String(slug || ''))
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase());
const buildBreadcrumbItems = (pathname: string): BreadcrumbItem[] => {
    const normalizedPath = pathname.replace(/\/+$/, '') || '/';
    if (normalizedPath === '/')
        return [];
    const segments = normalizedPath.split('/').filter(Boolean);
    const homeItem: BreadcrumbItem = { label: t("app.components.routing.page_breadcrumb.home"), href: '/' };
    const [first = '', second = '', third = '', fourth = ''] = segments;
    if (first === 'creations') {
        if (!second)
            return [homeItem, { label: t("app.components.routing.page_breadcrumb.blends") }];
        return [homeItem, { label: t("app.components.routing.page_breadcrumb.blends"), href: '/creations' }, { label: formatSlugLabel(second) }];
    }
    if (first === 'accessoires') {
        if (!second)
            return [homeItem, { label: t("app.components.routing.page_breadcrumb.accessories") }];
        return [homeItem, { label: t("app.components.routing.page_breadcrumb.accessories"), href: '/accessoires' }, { label: formatSlugLabel(second) }];
    }
    if (first === 'checkout') {
        return [homeItem, { label: t("app.components.routing.page_breadcrumb.cart"), href: '/cart' }, { label: t("app.components.routing.page_breadcrumb.shipping_payment") }];
    }
    if (first === 'account') {
        if (!second)
            return [homeItem, { label: t("app.components.routing.page_breadcrumb.my_account") }];
        if (second === 'orders')
            return [homeItem, { label: t("app.components.routing.page_breadcrumb.my_account"), href: '/account' }, { label: t("app.components.routing.page_breadcrumb.orders") }];
        if (second === 'edit')
            return [homeItem, { label: t("app.components.routing.page_breadcrumb.my_account"), href: '/account' }, { label: t("app.components.routing.page_breadcrumb.informations") }];
        if (second === 'address')
            return [homeItem, { label: t("app.components.routing.page_breadcrumb.my_account"), href: '/account' }, { label: t("app.components.routing.page_breadcrumb.addresses") }];
        if (second === 'order' && third && fourth === 'invoice') {
            return [
                homeItem,
                { label: t("app.components.routing.page_breadcrumb.my_account"), href: '/account' },
                { label: t("app.components.routing.page_breadcrumb.orders"), href: '/account/orders' },
                { label: t("app.components.routing.page_breadcrumb.invoice") },
            ];
        }
        if (second === 'order' && third) {
            return [
                homeItem,
                { label: t("app.components.routing.page_breadcrumb.my_account"), href: '/account' },
                { label: t("app.components.routing.page_breadcrumb.orders"), href: '/account/orders' },
                { label: t("app.components.routing.page_breadcrumb.details_order") },
            ];
        }
    }
    if (first in staticPageLabelMap) {
        return [homeItem, { label: staticPageLabelMap[first] }];
    }
    const fallback: BreadcrumbItem[] = [homeItem];
    segments.forEach((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;
        fallback.push({
            label: staticPageLabelMap[segment] || formatSlugLabel(segment),
            href: isLast ? undefined : href,
        });
    });
    return fallback;
};
export function PageBreadcrumb({ className }: {
    className?: string;
}) {
    const { pathname } = useLocation();
    const breadcrumbItems = useMemo(() => buildBreadcrumbItems(pathname), [pathname]);
    if (breadcrumbItems.length === 0)
        return null;
    return (<div className={cn('mb-6 border-t border-[#E5E0D5]/80 pt-2', className)}>
      <div className="flex flex-wrap items-center gap-1 text-[11px] tracking-wide text-[var(--sage-deep)]/55">
        {breadcrumbItems.map((item, index) => (<div key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 ? <span className="text-[var(--sage-deep)]/35">/</span> : null}
            {item.href ? (<Link to={item.href} className="transition-colors hover:text-[var(--gold-antique)]">
                {item.label}
              </Link>) : (<span className="text-[var(--sage-deep)]/75">{item.label}</span>)}
          </div>))}
      </div>
    </div>);
}
