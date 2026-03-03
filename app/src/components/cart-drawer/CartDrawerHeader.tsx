import { X } from 'lucide-react';

interface CartDrawerHeaderProps {
  title: string;
  onClose: () => void;
}

export function CartDrawerHeader({ title, onClose }: CartDrawerHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[#E5E0D5]">
      <h3 className="font-display text-lg text-[var(--sage-deep)] leading-snug">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="rounded-full p-2 text-[var(--sage-deep)]/70 hover:text-[var(--sage-deep)] hover:bg-[#F3F1EE] transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
