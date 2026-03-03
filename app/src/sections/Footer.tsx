import { Leaf, Instagram, TikTok, Facebook, Mail, MapPin, Phone } from 'lucide-react';
import { PRIMARY_NAV_LINKS } from '@/lib/navigation-links';

type FooterProps = {
  hideMainSection?: boolean;
  hideNewsletterSection?: boolean;
};

export function Footer({ hideMainSection = false, hideNewsletterSection = false }: FooterProps) {
  const year = new Date().getFullYear();
  const navigateToSection = (href: string) => {
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
    <footer className="w-full bg-[var(--sage-deep)] text-[var(--cream-apothecary)]">
      {/* Main Footer */}
      {!hideMainSection && (
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[var(--gold-antique)] flex items-center justify-center">
                <Leaf className="w-5 h-5 text-[var(--sage-deep)]" />
              </div>
              <span className="font-display text-xl">My Own Tea</span>
            </div>
            <p className="text-[var(--cream-apothecary)]/70 text-sm leading-relaxed mb-6">
              Créez votre thé signature à partir d'ingrédients bio soigneusement sélectionnés.
              Une expérience unique de mélange personnalisé.
            </p>
            <div className="flex gap-3">
              <a 
                href="https://www.instagram.com/myown_tea/" 
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a 
                href="https://www.tiktok.com/@myowntea" 
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors"
              >
                <TikTok className="w-5 h-5 scale-125 -translate-x-px translate-y-[0.2rem]" strokeWidth={2.2} />
              </a>
              <a 
                href="https://www.facebook.com/my.own.tea.fr" 
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a 
                href="mailto:contact@myowntea.com" 
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors"
              >
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display text-lg mb-6">Navigation</h4>
            <ul className="space-y-3">
              {PRIMARY_NAV_LINKS.map((link) => (
                <li key={link.label}>
                  <a 
                    href={link.href}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateToSection(link.href);
                    }}
                    className="text-[var(--cream-apothecary)]/70 hover:text-[var(--gold-antique)] transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="font-display text-lg mb-6">Informations</h4>
            <ul className="space-y-3">
              {[
                'Livraison & Retours',
                'Conditions générales',
                'Politique de confidentialité',
                'FAQ',
                'Contact'
              ].map(item => (
                <li key={item}>
                  <a 
                    href="#"
                    className="text-[var(--cream-apothecary)]/70 hover:text-[var(--gold-antique)] transition-colors text-sm"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-lg mb-6">Contact</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[var(--gold-antique)] flex-shrink-0 mt-0.5" />
                <span className="text-[var(--cream-apothecary)]/70 text-sm">
                  12 Rue des Arômes<br />
                  75011 Paris, France
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-[var(--gold-antique)] flex-shrink-0" />
                <span className="text-[var(--cream-apothecary)]/70 text-sm">
                  +33 1 23 45 67 89
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-[var(--gold-antique)] flex-shrink-0" />
                <span className="text-[var(--cream-apothecary)]/70 text-sm">
                  contact@myowntea.com
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      )}

      {/* Newsletter */}
      {!hideNewsletterSection && (
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="font-display text-lg mb-1">Rejoignez Notre Communauté</h4>
              <p className="text-[var(--cream-apothecary)]/60 text-sm">
                Recevez nos recettes exclusives et offres spéciales
              </p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <input 
                type="email"
                placeholder="Votre email"
                className="flex-1 md:w-64 px-4 py-3 bg-white/10 rounded-lg text-sm placeholder:text-[var(--cream-apothecary)]/40 border border-white/10 focus:border-[var(--gold-antique)] outline-none transition-colors"
              />
              <button className="px-6 py-3 bg-[var(--gold-antique)] text-[var(--sage-deep)] rounded-lg text-sm font-medium hover:bg-[#D4B872] transition-colors">
                S'inscrire
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[var(--cream-apothecary)]/50 text-sm">
              © {year} My Own Tea
            </p>
            <div className="flex items-center gap-6">
              <span className="text-[var(--cream-apothecary)]/50 text-sm">
                Paiement sécurisé
              </span>
              <div className="flex gap-2 items-center">
                {[
                  { id: 'visa', src: '/assets/footer/visa.png', alt: 'Visa' },
                  { id: 'mastercard', src: '/assets/footer/mastercard.png', alt: 'Mastercard' },
                  { id: 'paypal', src: '/assets/footer/paypal.png', alt: 'PayPal' },
                  { id: 'applepay', src: '/assets/footer/applepay.png', alt: 'Apple Pay' },
                  { id: 'googlepay', src: '/assets/footer/googlepay.png', alt: 'Google Pay' }
                ].map(card => (
                  <img
                    key={card.id}
                    src={card.src}
                    alt={card.alt}
                    loading="lazy"
                    className="w-10 h-6 object-contain rounded-[12%]"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}


