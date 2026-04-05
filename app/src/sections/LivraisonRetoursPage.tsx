import { InfoPageLayout } from './InfoPageLayout';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { t } from "@/lib/i18n";
export default function LivraisonRetoursPage() {
    const { settings } = useStoreSettings();
    return (<InfoPageLayout title={t("app.sections.livraison_retours_page.shipping_retours")} intro={t("app.sections.livraison_retours_page.intro")} updatedAt="01/04/2026" sections={[
            {
                title: t("app.sections.livraison_retours_page.delivery_zones_title"),
                paragraphs: [
                    t("app.sections.livraison_retours_page.delivery_zones_p1"),
                    t("app.sections.livraison_retours_page.delivery_zones_p2"),
                ],
                bullets: [
                    t("app.sections.livraison_retours_page.delivery_zones_b1"),
                    t("app.sections.livraison_retours_page.delivery_zones_b2"),
                    t("app.sections.livraison_retours_page.delivery_zones_b3"),
                ],
            },
            {
                title: t("app.sections.livraison_retours_page.lead_times_title"),
                paragraphs: [t("app.sections.livraison_retours_page.lead_times_p1")],
                bullets: [
                    t("app.sections.livraison_retours_page.lead_times_b1"),
                    t("app.sections.livraison_retours_page.lead_times_b2"),
                    t("app.sections.livraison_retours_page.lead_times_b3"),
                    t("app.sections.livraison_retours_page.lead_times_b4"),
                ],
            },
            {
                title: t("app.sections.livraison_retours_page.tracking_title"),
                paragraphs: [
                    t("app.sections.livraison_retours_page.tracking_p1"),
                ],
                bullets: [
                    t("app.sections.livraison_retours_page.tracking_b1"),
                    t("app.sections.livraison_retours_page.tracking_b2"),
                    t("app.sections.livraison_retours_page.tracking_b3"),
                ],
            },
            {
                title: t("app.sections.livraison_retours_page.returns_title"),
                paragraphs: [
                    t("app.sections.livraison_retours_page.returns_p1"),
                    t("app.sections.livraison_retours_page.returns_p2"),
                ],
                bullets: [
                    t("app.sections.livraison_retours_page.returns_b1"),
                    t("app.sections.livraison_retours_page.returns_b2"),
                ],
            },
            {
                title: t("app.sections.livraison_retours_page.claims_title"),
                paragraphs: [t("app.sections.livraison_retours_page.claims_p1", undefined, { contactEmail: settings.contactEmail })],
                bullets: [
                    t("app.sections.livraison_retours_page.claims_b1"),
                    t("app.sections.livraison_retours_page.claims_b2"),
                    t("app.sections.livraison_retours_page.claims_b3"),
                ],
            },
        ]}/>);
}
