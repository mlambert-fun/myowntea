import { InfoPageLayout } from './InfoPageLayout';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { t } from "@/lib/i18n";
export default function ConditionsGeneralesPage() {
    const { settings } = useStoreSettings();
    return (<InfoPageLayout title={t("app.sections.conditions_generales_page.terms_general")} intro={t("app.sections.conditions_generales_page.terms_encadrent_usage")} updatedAt="03/03/2026" sections={[
            {
                title: 'Commandes',
                paragraphs: [
                    t("app.sections.conditions_generales_page.order_validee_apres"),
                    t("app.sections.conditions_generales_page.blends_personnalisees_realisees"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.customer_verifie_informations"),
                    t("app.sections.conditions_generales_page.email_confirmation_envoye"),
                    t("app.sections.conditions_generales_page.tracking_statuses_available"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.price_payment"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.price_affiches_euros"),
                    t("app.sections.conditions_generales_page.payment_secure_stripe"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.shipping_transfert_responsabilite"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.order_remise_carrier"),
                    t("app.sections.conditions_generales_page.case_issue_shipping"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.droit_retractation"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.droit_retractation_applique"),
                    t("app.sections.conditions_generales_page.products_personnalises_confectionnes"),
                ],
            },
            {
                title: 'Support client',
                bullets: [
                    t("app.sections.conditions_generales_page.email_contact_myowntea", undefined, { contactEmail: settings.contactEmail }),
                    t("app.sections.conditions_generales_page.tracking_order_my"),
                    t("app.sections.conditions_generales_page.reclamation_preciser_numero"),
                ],
            },
        ]}/>);
}
