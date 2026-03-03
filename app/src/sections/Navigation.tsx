import { useState, useEffect } from 'react';
import { Leaf, Menu, X, ShoppingBag, User, UserCircle, Sparkles, Heart } from 'lucide-react';
import { useBlend } from '@/context/BlendContext';
import { useAuth } from '@/context/AuthContext';
import { LoginDrawer } from '@/components/login-drawer/LoginDrawer';
import { AccountDrawer } from '@/components/login-drawer/AccountDrawer';
import { PRIMARY_NAV_LINKS } from '@/lib/navigation-links';

type NavigationProps = {
  hidePrimaryNav?: boolean;
};

export function Navigation({ hidePrimaryNav = false }: NavigationProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { cartItems, cartTotal, openCartDrawer, openWishlistDrawer } = useBlend();
  const { customer } = useAuth();
  const isAuthenticated = Boolean(customer?.email);
  const [pulse, setPulse] = useState(false);
  const [isLoginDrawerOpen, setIsLoginDrawerOpen] = useState(false);
  const [isAccountDrawerOpen, setIsAccountDrawerOpen] = useState(false);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const handler = () => {
      setPulse(true);
      window.setTimeout(() => setPulse(false), 350);
    };
    window.addEventListener('cart-pulse', handler);
    return () => window.removeEventListener('cart-pulse', handler);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    setIsMobileMenuOpen(false);
    if (href.startsWith('/')) {
      if (window.location.pathname === '/' && href.startsWith('/?scroll=')) {
        const anchor = href.replace('/?scroll=', '#');
        const element = document.querySelector(anchor);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
          return;
        }
      }
      window.location.assign(href);
      return;
    }
    // If we're not on the home page, navigate back to home and request a scroll
    if (window.location.pathname !== '/') {
      const anchor = href.startsWith('#') ? href.replace('#', '') : href;
      window.location.assign(`/?scroll=${anchor}`);
      return;
    }

    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <nav 
        className={`fixed top-0 left-0 right-0 z-[500] transition-all duration-500 ${
          isScrolled 
            ? 'bg-white/90 backdrop-blur-md shadow-sm py-4' 
            : 'bg-transparent py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <a 
              href="/"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/';
              }}
              className="flex items-center gap-3 group"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isScrolled ? 'bg-[var(--sage-deep)]' : 'bg-[var(--gold-antique)]'
              }`}>
                <Leaf className={`w-5 h-5 transition-colors ${
                  isScrolled ? 'text-[var(--gold-antique)]' : 'text-[var(--sage-deep)]'
                }`} />
              </div>
              <span className={`font-display text-lg hidden sm:block transition-colors ${
                isScrolled ? 'text-[var(--sage-deep)]' : 'text-[var(--sage-deep)]'
              }`}>
                My Own Tea
              </span>
            </a>

            {/* Desktop Navigation */}
            {!hidePrimaryNav && (
              <div className="hidden md:flex items-center gap-8">
                {PRIMARY_NAV_LINKS.map(link => (
                  <button
                    key={link.label}
                    onClick={() => scrollToSection(link.href)}
                    className={`text-sm font-medium transition-colors hover:text-[var(--gold-antique)] ${
                      isScrolled ? 'text-[var(--sage-deep)]' : 'text-[var(--sage-deep)]'
                    }`}
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4">
              {!isAuthenticated && (
                <button
                  onClick={() => setIsLoginDrawerOpen(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cream-apothecary)]"
                  aria-label="Connexion"
                >
                  <User className="w-5 h-5 text-[var(--sage-deep)]" />
                </button>
              )}
              {isAuthenticated && (
                <button
                  onClick={() => setIsAccountDrawerOpen(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cream-apothecary)]"
                  aria-label="Compte"
                >
                  <UserCircle className="w-5 h-5 text-[var(--sage-deep)]" />
                </button>
              )}
              {isAuthenticated && (
                <button
                  onClick={() => openWishlistDrawer()}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cream-apothecary)]"
                  aria-label="Wishlist"
                >
                  <Heart className="w-5 h-5 text-[var(--sage-deep)]" />
                </button>
              )}
              {/* Cart */}
              <button onClick={openCartDrawer} className="relative w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--cream-apothecary)]">
                <ShoppingBag className={`w-5 h-5 ${
                  isScrolled ? 'text-[var(--sage-deep)]' : 'text-[var(--sage-deep)]'
                }`} />
                {cartCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center">
                    {pulse && (
                      <span className="absolute inset-0 rounded-full bg-[var(--gold-antique)] opacity-40 animate-ping" />
                    )}
                    <span className="relative z-10 w-5 h-5 bg-[var(--gold-antique)] text-[var(--sage-deep)] text-xs font-medium rounded-full flex items-center justify-center">
                      {cartCount}
                    </span>
                  </div>
                )}
              </button>

              {/* CTA */}
              <div className="relative hidden sm:flex group">
                <button
                  onClick={() => scrollToSection('#creator')}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[var(--cream-apothecary)]"
                  aria-label="Créer un mélange"
                >
                  <Sparkles className="w-5 h-5 text-[var(--sage-deep)]" />
                </button>
                <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                  Créer mon thé dans l'atelier du maître mélangeur
                </span>
              </div>

              {/* Mobile Menu Button */}
              {!hidePrimaryNav && (
                <button 
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 hover:bg-[var(--cream-apothecary)] rounded-full transition-colors"
                >
                  {isMobileMenuOpen ? (
                    <X className="w-6 h-6 text-[var(--sage-deep)]" />
                  ) : (
                    <Menu className="w-6 h-6 text-[var(--sage-deep)]" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {!hidePrimaryNav && (
      <div 
        className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ${
          isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-close-cross"
          onClick={() => setIsMobileMenuOpen(false)}
        />
        <div 
          className={`absolute top-0 right-0 w-80 max-w-full h-full bg-white shadow-xl transition-transform duration-300 ${
            isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="p-6 pt-20">
            <div className="space-y-4">
              {PRIMARY_NAV_LINKS.map(link => (
                <button
                  key={link.label}
                  onClick={() => scrollToSection(link.href)}
                  className="block w-full text-left py-3 text-lg text-[var(--sage-deep)] hover:text-[var(--gold-antique)] transition-colors border-b border-[#E5E0D5]"
                >
                  {link.label}
                </button>
              ))}
              {!isAuthenticated ? (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsLoginDrawerOpen(true);
                  }}
                  className="block w-full text-left py-3 text-lg text-[var(--sage-deep)] hover:text-[var(--gold-antique)] transition-colors border-b border-[#E5E0D5]"
                >
                  Connexion
                </button>
              ) : null}
            </div>

            {/* Cart Summary */}
            {cartCount > 0 && (
              <div className="mt-8 p-4 bg-[var(--cream-apothecary)] rounded-xl">
                <h4 className="font-medium text-[var(--sage-deep)] mb-2">Votre panier</h4>
                <p className="text-sm text-[var(--sage-deep)]/60 mb-3">
                  {cartCount} article{cartCount !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-display text-xl text-[var(--gold-antique)]">
                    {cartTotal.toFixed(2)} €
                  </span>
                  <button 
                    onClick={() => (window.location.href = '/cart')}
                    className="text-sm text-[var(--sage-deep)] underline"
                  >
                    Voir
                  </button>
                </div>
              </div>
            )}

            <button 
              onClick={() => scrollToSection('#creator')}
              className="w-full btn-primary mt-8"
            >
              Créer Mon Thé
            </button>
          </div>
        </div>
      </div>
      )}

      <LoginDrawer open={isLoginDrawerOpen} onClose={() => setIsLoginDrawerOpen(false)} />
      <AccountDrawer open={isAccountDrawerOpen} onClose={() => setIsAccountDrawerOpen(false)} />
    </>
  );
}
