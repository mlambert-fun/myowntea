import { InfoPageLayout } from './InfoPageLayout';
import { t } from "@/lib/i18n";
export default function LivraisonRetoursPage() {
    return (<InfoPageLayout title={t("app.sections.livraison_retours_page.shipping_retours")} intro={t("app.sections.livraison_retours_page.retrouvez_ici_modalites")} updatedAt="03/03/2026" sections={[
            {
                title: t("app.sections.livraison_retours_page.modes_shipping"),
                paragraphs: [
                    t("app.sections.livraison_retours_page.nous_proposons_shipping"),
                    t("app.sections.livraison_retours_page.options_affichees_checkout"),
                ],
                bullets: [
                    t("app.sections.livraison_retours_page.home_delivery_tracking"),
                    t("app.sections.livraison_retours_page.pickup_point_choice"),
                    t("app.sections.livraison_retours_page.confirmation_shipment_envoyee"),
                ],
            },
            {
                title: t("app.sections.livraison_retours_page.delais_indicatifs"),
                bullets: [
                    t("app.sections.livraison_retours_page.preparation_atelier_jours"),
                    t("app.sections.livraison_retours_page.transit_france_metropolitan"),
                    t("app.sections.livraison_retours_page.tracking_peut_consulte"),
                ],
            },
            {
                title: t("app.sections.livraison_retours_page.retours_reclamations"),
                paragraphs: [
                    t("app.sections.livraison_retours_page.accessoires_products_standards"),
                    t("app.sections.livraison_retours_page.blends_personnalisees_melanges"),
                ],
                bullets: [
                    t("app.sections.livraison_retours_page.contactez_nous_page"),
                    t("app.sections.livraison_retours_page.equipe_vous_confirme"),
                    t("app.sections.livraison_retours_page.remboursement_declenche_apres"),
                ],
            },
        ]}/>);
}
