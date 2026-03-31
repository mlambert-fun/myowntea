import { useEffect, useState } from 'react';
import { saveLocaleMarketPreference } from '@/lib/locale-market';
import { setLanguageFromLocale } from '@/lib/i18n';
import { t } from "@/lib/i18n";
const OPTIONS = [
    { id: 'FR_FR', label: t("app.components.locale.locale_market_prompt.france"), detail: t("app.components.locale.locale_market_prompt.french_france"), locale: 'fr-FR', countryCode: 'FR' },
    { id: 'FR_BE', label: t("app.components.locale.locale_market_prompt.belgium"), detail: t("app.components.locale.locale_market_prompt.french_belgium"), locale: 'fr-BE', countryCode: 'BE' },
];
export function LocaleMarketPrompt({ forceOpen = false }: {
    forceOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(forceOpen);
    useEffect(() => {
        setIsOpen(forceOpen);
    }, [forceOpen]);
    if (!isOpen)
        return null;
    return (<div className="fixed inset-x-0 bottom-4 z-[520] px-4 sm:bottom-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#E5E0D5] bg-white p-4 shadow-[0_14px_34px_rgba(45,62,54,0.18)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-[var(--sage-deep)]">{t("app.components.locale.locale_market_prompt.choisissez_locale_country")}</h3>
            <p className="mt-1 text-sm text-[var(--sage-deep)]/70">{t("app.components.locale.locale_market_prompt.nous_utiliserons_choice")}</p>
          </div>
          <button type="button" className="rounded-full border border-[#E5E0D5] px-3 py-1 text-xs text-[var(--sage-deep)]/70 transition hover:bg-[#F8F4EC]" onClick={() => {
            setIsOpen(false);
        }}>
            Plus tard
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((option) => (<button key={option.id} type="button" className="rounded-xl border border-[#E5E0D5] bg-[#FCFAF6] px-4 py-3 text-left transition hover:border-[var(--gold-antique)] hover:bg-[#F8F4EC]" onClick={() => {
                setLanguageFromLocale(option.locale);
                saveLocaleMarketPreference({
                    locale: option.locale,
                    countryCode: option.countryCode,
                });
                setIsOpen(false);
                window.dispatchEvent(new Event('mot-locale-market-updated'));
                window.location.reload();
            }}>
              <div className="font-medium text-[var(--sage-deep)]">{option.label}</div>
              <div className="mt-1 text-xs text-[var(--sage-deep)]/65">{option.detail}</div>
            </button>))}
        </div>
      </div>
    </div>);
}
