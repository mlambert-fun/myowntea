import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

const staticPageLabelMap: Record<string, string> = {
  login: 'Connexion',
  'forgot-password': 'Mot de passe oublié',
  'reset-password': 'Nouveau mot de passe',
  register: 'Inscription',
  logout: 'Déconnexion',
  cart: 'Panier',
  checkout: 'Livraison et paiement',
  subscriptions: 'Abonnements',
  order: 'Confirmation',
  account: 'Mon compte',
  address: 'Adresses',
  orders: 'Commandes',
  edit: 'Informations',
  invoice: 'Facture',
};

const formatSlugLabel = (slug: string) =>
  decodeURIComponent(String(slug || ''))
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase());

const buildBreadcrumbItems = (pathname: string): BreadcrumbItem[] => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (normalizedPath === '/') return [];

  const segments = normalizedPath.split('/').filter(Boolean);
  const homeItem: BreadcrumbItem = { label: 'Accueil', href: '/' };
  const [first = '', second = '', third = '', fourth = ''] = segments;

  if (first === 'creations') {
    if (!second) return [homeItem, { label: 'Créations' }];
    return [homeItem, { label: 'Créations', href: '/creations' }, { label: formatSlugLabel(second) }];
  }

  if (first === 'accessoires') {
    if (!second) return [homeItem, { label: 'Accessoires' }];
    return [homeItem, { label: 'Accessoires', href: '/accessoires' }, { label: formatSlugLabel(second) }];
  }

  if (first === 'checkout') {
    return [homeItem, { label: 'Panier', href: '/cart' }, { label: 'Livraison et paiement' }];
  }

  if (first === 'account') {
    if (!second) return [homeItem, { label: 'Mon compte' }];
    if (second === 'orders') return [homeItem, { label: 'Mon compte', href: '/account' }, { label: 'Commandes' }];
    if (second === 'edit') return [homeItem, { label: 'Mon compte', href: '/account' }, { label: 'Informations' }];
    if (second === 'address') return [homeItem, { label: 'Mon compte', href: '/account' }, { label: 'Adresses' }];
    if (second === 'order' && third && fourth === 'invoice') {
      return [
        homeItem,
        { label: 'Mon compte', href: '/account' },
        { label: 'Commandes', href: '/account/orders' },
        { label: 'Facture' },
      ];
    }
    if (second === 'order' && third) {
      return [
        homeItem,
        { label: 'Mon compte', href: '/account' },
        { label: 'Commandes', href: '/account/orders' },
        { label: 'Détail commande' },
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

export function PageBreadcrumb({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const breadcrumbItems = useMemo(() => buildBreadcrumbItems(pathname), [pathname]);

  if (breadcrumbItems.length === 0) return null;

  return (
    <div className={cn('mb-6 border-t border-[#E5E0D5]/80 pt-2', className)}>
      <div className="flex flex-wrap items-center gap-1 text-[11px] tracking-wide text-[var(--sage-deep)]/55">
        {breadcrumbItems.map((item, index) => (
          <div key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 ? <span className="text-[var(--sage-deep)]/35">/</span> : null}
            {item.href ? (
              <Link to={item.href} className="transition-colors hover:text-[var(--gold-antique)]">
                {item.label}
              </Link>
            ) : (
              <span className="text-[var(--sage-deep)]/75">{item.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
