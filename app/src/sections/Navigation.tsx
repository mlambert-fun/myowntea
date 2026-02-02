import { useState, useEffect } from 'react';
import { Leaf, Menu, X, ShoppingBag } from 'lucide-react';
import { useBlend } from '@/context/BlendContext';

const navLinks = [
  { label: 'Créer', href: '#creator' },
  { label: 'Ingrédients', href: '#gallery' },
  { label: 'Comment ça marche', href: '#how-it-works' },
  { label: 'Témoignages', href: '#testimonials' }
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { selectedIngredients, totalPrice } = useBlend();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    setIsMobileMenuOpen(false);
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <nav 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled 
            ? 'bg-white/90 backdrop-blur-md shadow-sm py-4' 
            : 'bg-transparent py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <a 
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
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
                L'Atelier des Arômes
              </span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map(link => (
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

            {/* Actions */}
            <div className="flex items-center gap-4">
              {/* Cart */}
              <button className="relative p-2 hover:bg-[var(--cream-apothecary)] rounded-full transition-colors">
                <ShoppingBag className={`w-5 h-5 ${
                  isScrolled ? 'text-[var(--sage-deep)]' : 'text-[var(--sage-deep)]'
                }`} />
                {selectedIngredients.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--gold-antique)] text-[var(--sage-deep)] text-xs font-medium rounded-full flex items-center justify-center">
                    {selectedIngredients.length}
                  </span>
                )}
              </button>

              {/* CTA */}
              <button 
                onClick={() => scrollToSection('#creator')}
                className="hidden sm:flex btn-primary text-xs py-3 px-6"
              >
                Créer Mon Thé
              </button>

              {/* Mobile Menu Button */}
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
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div 
        className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ${
          isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
        <div 
          className={`absolute top-0 right-0 w-80 max-w-full h-full bg-white shadow-xl transition-transform duration-300 ${
            isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="p-6 pt-20">
            <div className="space-y-4">
              {navLinks.map(link => (
                <button
                  key={link.label}
                  onClick={() => scrollToSection(link.href)}
                  className="block w-full text-left py-3 text-lg text-[var(--sage-deep)] hover:text-[var(--gold-antique)] transition-colors border-b border-[#E5E0D5]"
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* Cart Summary */}
            {selectedIngredients.length > 0 && (
              <div className="mt-8 p-4 bg-[var(--cream-apothecary)] rounded-xl">
                <h4 className="font-medium text-[var(--sage-deep)] mb-2">Votre création</h4>
                <p className="text-sm text-[var(--sage-deep)]/60 mb-3">
                  {selectedIngredients.length} ingrédient{selectedIngredients.length !== 1 ? 's' : ''}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-display text-xl text-[var(--gold-antique)]">
                    {totalPrice.toFixed(2)} €
                  </span>
                  <button 
                    onClick={() => scrollToSection('#creator')}
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
    </>
  );
}
