import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type ShippingInfoAccordionProps = {
  className?: string;
};

export function ShippingInfoAccordion({ className = '' }: ShippingInfoAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={['bg-white rounded-2xl p-5 shadow', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex w-full items-center pr-10 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm text-[var(--sage-deep)]/60">Livraison fiable avec</span>
          <img
            src="/assets/misc/logo_mondial_relay.webp"
            alt="Logo Mondial Relay"
            className="ml-2 h-14 w-auto"
            loading="lazy"
          />
        </div>
        <ChevronDown
          className={`absolute right-0 top-1/2 h-[1.4rem] w-[1.4rem] -translate-y-1/2 text-[var(--sage-deep)] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="mt-3 space-y-3 text-sm text-[var(--sage-deep)]/80">
          <div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F3] p-3">
            <div className="font-medium text-[var(--sage-deep)]">France metropolitaine</div>
            <div className="text-xs text-[var(--sage-deep)]/70">Domicile: 5,00 EUR</div>
            <div className="text-xs text-[var(--sage-deep)]/70">Point relais: 4,50 EUR</div>
            <div className="text-xs text-[var(--sage-deep)]/70 mt-1">Livraison offerte des 45 EUR d'achat.</div>
          </div>
          <div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F3] p-3">
            <div className="font-medium text-[var(--sage-deep)]">Belgique</div>
            <div className="text-xs text-[var(--sage-deep)]/70">Domicile: 9,00 EUR</div>
            <div className="text-xs text-[var(--sage-deep)]/70">Point relais: 5,50 EUR</div>
          </div>
        </div>
      )}
    </div>
  );
}

