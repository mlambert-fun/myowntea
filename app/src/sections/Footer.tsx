import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, Globe, Leaf, Instagram, TikTok, Facebook, Mail, MapPin, Phone } from 'lucide-react';
import { PRIMARY_NAV_LINKS } from '@/lib/navigation-links';
import { api } from '@/api/client';
import { showToast } from '@/lib/toast';
import { DEFAULT_LOCALE_MARKET, readLocaleMarketPreference, saveLocaleMarketPreference } from '@/lib/locale-market';
import { setLanguageFromLocale } from '@/lib/i18n';
import { t } from "@/lib/i18n";
import { useStoreSettings } from '@/context/StoreSettingsContext';
type FooterProps = {
    hideMainSection?: boolean;
    hideNewsletterSection?: boolean;
};
const LOCALE_MARKET_OPTIONS = [
    { id: 'FR_FR', label: t("app.sections.footer.french_france"), locale: 'fr-FR', countryCode: 'FR' },
    { id: 'EN_FR', label: t("app.sections.footer.english_france"), locale: 'en-FR', countryCode: 'FR' },
    { id: 'FR_BE', label: t("app.sections.footer.french_belgium"), locale: 'fr-BE', countryCode: 'BE' },
    { id: 'EN_BE', label: t("app.sections.footer.english_belgium"), locale: 'en-BE', countryCode: 'BE' },
];
export function Footer({ hideMainSection = false, hideNewsletterSection = false }: FooterProps) {
    const { settings } = useStoreSettings();
    const year = new Date().getFullYear();
    const [newsletterEmail, setNewsletterEmail] = useState('');
    const [newsletterState, setNewsletterState] = useState<'idle' | 'subscribe-loading'>('idle');
    const [newsletterError, setNewsletterError] = useState<string | null>(null);
    const [newsletterMessage, setNewsletterMessage] = useState<string | null>(null);
    const [localeMarketLabel, setLocaleMarketLabel] = useState('FR-FR');
    const [selectedLocaleKey, setSelectedLocaleKey] = useState(`${DEFAULT_LOCALE_MARKET.locale}|${DEFAULT_LOCALE_MARKET.countryCode}`);
    const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
    const infoLinks = useMemo(() => [
        { label: t("app.sections.footer.shipping_retours"), href: '/livraison-retours' },
        { label: t("app.sections.footer.terms_general"), href: '/conditions-generales' },
        { label: t("app.sections.footer.politique_privacy_2"), href: '/politique-confidentialite' },
        { label: 'FAQ', href: '/faq' },
    ], []);
    useEffect(() => {
        const updateLocaleLabel = () => {
            const preference = readLocaleMarketPreference();
            if (!preference) {
                const defaultLang = DEFAULT_LOCALE_MARKET.locale.split('-')[0]?.toUpperCase() || 'FR';
                setSelectedLocaleKey(`${DEFAULT_LOCALE_MARKET.locale}|${DEFAULT_LOCALE_MARKET.countryCode}`);
                setLocaleMarketLabel(`${defaultLang}-${DEFAULT_LOCALE_MARKET.countryCode}`);
                return;
            }
            const lang = preference.locale.split('-')[0]?.toUpperCase() || 'FR';
            setSelectedLocaleKey(`${preference.locale}|${preference.countryCode}`);
            setLocaleMarketLabel(`${lang}-${preference.countryCode}`);
        };
        updateLocaleLabel();
        window.addEventListener('mot-locale-market-updated', updateLocaleLabel);
        window.addEventListener('storage', updateLocaleLabel);
        return () => {
            window.removeEventListener('mot-locale-market-updated', updateLocaleLabel);
            window.removeEventListener('storage', updateLocaleLabel);
        };
    }, []);
    const selectLocaleMarket = (option: {
        locale: string;
        countryCode: string;
    }) => {
        setLanguageFromLocale(option.locale);
        saveLocaleMarketPreference({
            locale: option.locale,
            countryCode: option.countryCode,
        });
        const lang = option.locale.split('-')[0]?.toUpperCase() || 'FR';
        setSelectedLocaleKey(`${option.locale}|${option.countryCode}`);
        setLocaleMarketLabel(`${lang}-${option.countryCode}`);
        setIsLocaleMenuOpen(false);
        window.dispatchEvent(new Event('mot-locale-market-updated'));
        window.location.reload();
    };
    const validateNewsletterEmail = (rawEmail: string) => {
        const email = rawEmail.trim();
        if (!email)
            return { ok: false as const, email: '', error: t("app.sections.footer.please_enter_email") };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { ok: false as const, email: '', error: t("app.sections.footer.address_email_invalid") };
        }
        return { ok: true as const, email };
    };
    const isNewsletterEmailValid = validateNewsletterEmail(newsletterEmail).ok;
    const handleSubscribe = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setNewsletterError(null);
        setNewsletterMessage(null);
        const validation = validateNewsletterEmail(newsletterEmail);
        if (!validation.ok) {
            setNewsletterError(validation.error);
            return;
        }
        setNewsletterState('subscribe-loading');
        try {
            const response = await api.subscribeNewsletter({
                email: validation.email,
                consent: true,
                source: 'FOOTER_NEWSLETTER',
                consentVersion: 'v1',
            });
            setNewsletterMessage(response.message || t("app.sections.footer.signup_confirmed"));
            showToast(response.message || t("app.sections.footer.signup_newsletter_confirmed"), 'success');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : t("app.sections.footer.failed_vous_register");
            setNewsletterError(message);
            showToast(message, 'error');
        }
        finally {
            setNewsletterState('idle');
        }
    };
    const requestHomeScroll = (targetId: string) => {
        window.dispatchEvent(new CustomEvent('home-scroll-request', {
            detail: { targetId }
        }));
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('a', targetId);
        nextUrl.searchParams.delete('scroll');
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
    };
    const navigateToSection = (href: string) => {
        if (href.startsWith('/')) {
            if (window.location.pathname === '/' && (href.startsWith('/?a=') || href.startsWith('/?scroll='))) {
                requestHomeScroll(href.replace('/?a=', '').replace('/?scroll=', ''));
                return;
            }
            window.location.assign(href);
            return;
        }
        if (window.location.pathname !== '/') {
            const anchor = href.startsWith('#') ? href.replace('#', '') : href;
            window.location.assign(`/?a=${anchor}`);
            return;
        }
        requestHomeScroll(href.startsWith('#') ? href.slice(1) : href);
    };
    return (<footer className="w-full bg-[var(--sage-deep)] text-[var(--cream-apothecary)]">
      {!hideMainSection && (<div className="max-w-7xl mx-auto px-6 lg:px-12 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[var(--gold-antique)] flex items-center justify-center">
                <Leaf className="w-5 h-5 text-[var(--sage-deep)]"/>
              </div>
              <span className="font-display text-xl">My Own Tea</span>
            </div>
            <p className="text-[var(--cream-apothecary)]/70 text-sm leading-relaxed mb-6">{t("app.sections.footer.create_tea_signature")}</p>
            <div className="flex gap-3">
              <a href="https://www.instagram.com/myown_tea/" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors">
                <Instagram className="w-5 h-5"/>
              </a>
              <a href="https://www.tiktok.com/@myowntea" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors">
                <TikTok className="w-5 h-5 scale-125 -translate-x-px translate-y-[0.2rem]" strokeWidth={2.2}/>
              </a>
              <a href="https://www.facebook.com/my.own.tea.fr" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors">
                <Facebook className="w-5 h-5"/>
              </a>
              <a href="/contact" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-[var(--gold-antique)] transition-colors">
                <Mail className="w-5 h-5"/>
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-display text-lg mb-6">Navigation</h4>
            <ul className="space-y-3">
              {PRIMARY_NAV_LINKS.map((link) => (<li key={link.label}>
                  <a href={link.href} onClick={(e) => {
                    e.preventDefault();
                    navigateToSection(link.href);
                }} className="text-[var(--cream-apothecary)]/70 hover:text-[var(--gold-antique)] transition-colors text-sm">
                    {link.label}
                  </a>
                </li>))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-lg mb-6">Informations</h4>
            <ul className="space-y-3">
              {infoLinks.map((link) => (<li key={link.href}>
                  <a href={link.href} onClick={(e) => {
                    e.preventDefault();
                    navigateToSection(link.href);
                }} className="text-[var(--cream-apothecary)]/70 hover:text-[var(--gold-antique)] transition-colors text-sm">
                    {link.label}
                  </a>
                </li>))}
              <li>
                <a href="/subscriptions" onClick={(e) => {
                    e.preventDefault();
                    navigateToSection('/subscriptions');
                }} className="text-[var(--cream-apothecary)]/70 hover:text-[var(--gold-antique)] transition-colors text-sm">
                  {t("app.sections.navigation.subscriptions")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-lg mb-6">Contact</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[var(--gold-antique)] flex-shrink-0 mt-0.5"/>
                <span className="text-[var(--cream-apothecary)]/70 text-sm">{settings.shopAddress}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-[var(--gold-antique)] flex-shrink-0"/>
                <span className="text-[var(--cream-apothecary)]/70 text-sm">
                  {settings.shopPhone}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-[var(--gold-antique)] flex-shrink-0"/>
                <span className="text-[var(--cream-apothecary)]/70 text-sm">
                  {settings.contactEmail}
                </span>
              </li>
              <li className="pt-1">
                <a
                  href="/contact"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToSection('/contact');
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-[var(--cream-apothecary)]/75 transition-colors hover:border-[var(--gold-antique)] hover:text-[var(--gold-antique)]"
                  style={{ width: '260px' }}
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>)}

      {!hideNewsletterSection && (<div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h4 className="font-display text-lg mb-1">{t("app.sections.footer.rejoignez_community")}</h4>
              <p className="text-[var(--cream-apothecary)]/60 text-sm">{t("app.sections.footer.recevez_recipes_exclusives")}</p>
            </div>

            <form className="w-full md:w-auto md:min-w-[420px]" onSubmit={handleSubscribe}>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type={t("app.sections.footer.email")} placeholder={t("app.sections.footer.email_2")} value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} className="flex-1 md:w-64 px-4 py-3 bg-white/10 rounded-lg text-sm placeholder:text-[var(--cream-apothecary)]/40 border border-white/10 focus:border-[var(--gold-antique)] outline-none transition-colors"/>
                <button type="submit" disabled={newsletterState !== 'idle' || !isNewsletterEmailValid} className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
                  {newsletterState === 'subscribe-loading' ? t("app.sections.footer.signup") : "S'inscrire"}
                </button>
              </div>

              <p className="mt-3 text-xs text-[var(--cream-apothecary)]/70">{t("app.sections.footer.donnees_traitees_selon")}{' '}
                <a href="/politique-confidentialite" onClick={(e) => {
                e.preventDefault();
                navigateToSection('/politique-confidentialite');
            }} className="underline hover:text-[var(--gold-antique)]">{t("app.sections.footer.politique_privacy")}</a>
                .
              </p>

              {newsletterError && (<p className="mt-2 text-xs text-[#FFD8D8]">{newsletterError}</p>)}
              {newsletterMessage && !newsletterError && (<p className="mt-2 text-xs text-[#D6F4D0]">{newsletterMessage}</p>)}
            </form>
          </div>
        </div>
      </div>)}

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[var(--cream-apothecary)]/50 text-sm">
              © {year} My Own Tea
            </p>
            <div className="flex items-center gap-6">
              <div className="relative" onMouseEnter={() => setIsLocaleMenuOpen(true)} onMouseLeave={() => setIsLocaleMenuOpen(false)}>
                <button type="button" onClick={() => setIsLocaleMenuOpen((prev) => !prev)} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--cream-apothecary)]/90 transition hover:border-[var(--gold-antique)] hover:text-[var(--cream-apothecary)]" aria-label={t("app.sections.footer.choisir_locale_country")}>
                  <Globe className="h-3.5 w-3.5"/>
                  <span>{localeMarketLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5"/>
                </button>
                {isLocaleMenuOpen && (<div className="absolute right-0 bottom-full h-2 w-72" aria-hidden="true"/>)}
                <div className={`absolute right-0 bottom-full mb-2 w-72 rounded-xl border border-[#E5E0D5] bg-white p-2 text-[var(--sage-deep)] shadow-lg transition ${isLocaleMenuOpen ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 translate-y-1'}`}>
                  {LOCALE_MARKET_OPTIONS.map((option) => {
            const optionKey = `${option.locale}|${option.countryCode}`;
            const isSelected = optionKey === selectedLocaleKey;
            return (<button key={option.id} type="button" className={`w-full rounded-lg px-3 py-2 text-left transition ${isSelected
                    ? 'bg-[var(--cream-apothecary)] text-[var(--sage-deep)]'
                    : 'text-[var(--sage-deep)]/85 hover:bg-[var(--cream-apothecary)]/70'}`} onClick={() => selectLocaleMarket(option)}>
                        <div className="truncate text-sm font-medium whitespace-nowrap">{option.label}</div>
                      </button>);
        })}
                </div>
              </div>
              <span className="text-[var(--cream-apothecary)]/50 text-sm">{t("app.sections.footer.secure_payment")}</span>
              <div className="flex gap-2 items-center">
                {[
            { id: 'visa', src: '/assets/footer/visa.png', alt: 'Visa' },
            { id: 'mastercard', src: '/assets/footer/mastercard.png', alt: 'Mastercard' },
            { id: 'amex', src: '/assets/footer/amex.png', alt: 'American Express' },
            { id: 'discover', src: '/assets/footer/discover.png', alt: 'Discover' },
            { id: 'paypal', src: '/assets/footer/paypal.png', alt: 'PayPal' },
            { id: 'applepay', src: '/assets/footer/applepay.png', alt: 'Apple Pay' },
            { id: 'googlepay', src: '/assets/footer/googlepay.png', alt: 'Google Pay' }
        ].map(card => (<img key={card.id} src={card.src} alt={card.alt} loading="lazy" className="w-10 h-6 object-contain rounded-[12%]"/>))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>);
}
