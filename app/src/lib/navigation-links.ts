import { t } from "@/lib/i18n";
export const PRIMARY_NAV_LINKS = [
    { label: t("app.lib.navigation_links.create"), href: '#creator' },
    { label: t("app.lib.navigation_links.comment_marche"), href: '#how-it-works' },
    { label: t("app.lib.navigation_links.blends"), href: '#topcreations' },
    { label: 'Accessoires', href: '/?a=accessoires' },
    { label: t("app.lib.navigation_links.temoignages"), href: '#testimonials' },
] as const;
