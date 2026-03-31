import { t } from "@/lib/i18n";
interface CartDrawerActionsProps {
    onCreateBlend: () => void;
    onCheckout: () => void;
    showCheckout?: boolean;
}
export function CartDrawerActions({ onCreateBlend, onCheckout, showCheckout = true }: CartDrawerActionsProps) {
    return (<div className="grid gap-3">
      {showCheckout && (<button className="w-full btn-primary" onClick={onCheckout}>{t("app.components.cart_drawer.cart_drawer_actions.finaliser_my_order")}</button>)}
      <button className="w-full btn-secondary" onClick={onCreateBlend}>{t("app.components.cart_drawer.cart_drawer_actions.create_new_melange")}</button>
    </div>);
}

