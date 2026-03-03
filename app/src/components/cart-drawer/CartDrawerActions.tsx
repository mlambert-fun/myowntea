interface CartDrawerActionsProps {
  onCreateBlend: () => void;
  onCheckout: () => void;
  showCheckout?: boolean;
}

export function CartDrawerActions({ onCreateBlend, onCheckout, showCheckout = true }: CartDrawerActionsProps) {
  return (
    <div className="grid gap-3">
      <button className="w-full btn-secondary" onClick={onCreateBlend}>
        Créer un nouveau mélange
      </button>
      {showCheckout && (
        <button className="w-full btn-primary" onClick={onCheckout}>
          Finaliser ma commande
        </button>
      )}
    </div>
  );
}
