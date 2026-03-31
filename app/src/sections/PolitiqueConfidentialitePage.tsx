import { InfoPageLayout } from './InfoPageLayout';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { t } from "@/lib/i18n";
export default function PolitiqueConfidentialitePage() {
    const { settings } = useStoreSettings();
    return (<InfoPageLayout title={t("app.sections.politique_confidentialite_page.politique_privacy")} intro={t("app.sections.politique_confidentialite_page.nous_traitons_donnees")} updatedAt="03/03/2026" sections={[
            {
                title: t("app.sections.politique_confidentialite_page.donnees_collectees"),
                bullets: [
                    t("app.sections.politique_confidentialite_page.account_customer_identite"),
                    t("app.sections.politique_confidentialite_page.order_contenu_cart"),
                    t("app.sections.politique_confidentialite_page.newsletter_email_consentement"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.finalites"),
                bullets: [
                    t("app.sections.politique_confidentialite_page.execution_orders_service"),
                    t("app.sections.politique_confidentialite_page.management_account_customer"),
                    t("app.sections.politique_confidentialite_page.envoi_newsletters_emails"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.consentement_rgpd_newsletter"),
                paragraphs: [
                    t("app.sections.politique_confidentialite_page.signup_newsletter_footer"),
                    t("app.sections.politique_confidentialite_page.nous_stockons_status"),
                ],
                bullets: [
                    t("app.sections.politique_confidentialite_page.opt_signup_newsletter"),
                    t("app.sections.politique_confidentialite_page.opt_out_desinscription"),
                    t("app.sections.politique_confidentialite_page.edit_possible_tout"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.droits"),
                bullets: [
                    t("app.sections.politique_confidentialite_page.acces_rectification_suppression"),
                    t("app.sections.politique_confidentialite_page.limitation_opposition_traitement"),
                    t("app.sections.politique_confidentialite_page.retrait_consentement_tout"),
                ],
                paragraphs: [t("app.sections.politique_confidentialite_page.exercer_droits_contactez", undefined, { contactEmail: settings.contactEmail })],
            },
        ]}/>);
}
