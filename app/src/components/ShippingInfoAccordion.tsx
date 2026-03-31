import { useState } from 'react';
import { ChevronDown, Truck } from 'lucide-react';
import { t } from "@/lib/i18n";
type ShippingInfoAccordionProps = {
    className?: string;
};
export function ShippingInfoAccordion({ className = '' }: ShippingInfoAccordionProps) {
    const [isOpen, setIsOpen] = useState(false);
    return (<div className={['bg-white rounded-2xl px-5 py-3.5 shadow', className].filter(Boolean).join(' ')}>
      <button type="button" onClick={() => setIsOpen((prev) => !prev)} className="relative flex w-full items-center pr-10 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm text-[var(--sage-deep)]/60">{t("app.components.shipping_info_accordion.shipping_fiable")}</span>
          <img src="/assets/misc/logo_mondial_relay.webp" alt={t("app.components.shipping_info_accordion.logo_alt")} className="ml-2 h-8 w-auto" loading="lazy"/>
        </div>
        <ChevronDown className={`absolute right-0 top-1/2 h-5 w-5 shrink-0 -translate-y-1/2 text-[var(--gold-antique)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}/>
      </button>
      {isOpen && (<div className="mt-3 space-y-3 border-t border-[var(--gold-antique)]/15 pt-4 text-sm text-[var(--sage-deep)]/80">
          <div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F3] p-3">
            <div className="font-medium text-[var(--sage-deep)]">{t("app.components.shipping_info_accordion.france_metropolitan")}</div>
            <div className="text-xs text-[var(--sage-deep)]/70">{t("app.components.shipping_info_accordion.home_price_fr")}</div>
            <div className="text-xs text-[var(--sage-deep)]/70">{t("app.components.shipping_info_accordion.relay_price_fr")}</div>
          </div>
          <div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F3] p-3">
            <div className="font-medium text-[var(--sage-deep)]">{t("app.components.shipping_info_accordion.belgium")}</div>
            <div className="text-xs text-[var(--sage-deep)]/70">{t("app.components.shipping_info_accordion.home_price_be")}</div>
            <div className="text-xs text-[var(--sage-deep)]/70">{t("app.components.shipping_info_accordion.relay_price_be")}</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--sage-deep)]/70">
            <Truck className="h-3.5 w-3.5 shrink-0 text-[var(--gold-antique)]"/>
            <span>{t("app.components.shipping_info_accordion.shipping_offerte_eur")}</span>
          </div>
        </div>)}
    </div>);
}
