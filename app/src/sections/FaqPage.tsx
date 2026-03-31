import { InfoPageLayout } from './InfoPageLayout';
import { t } from "@/lib/i18n";
export default function FaqPage() {
    return (<InfoPageLayout title="FAQ" intro={t("app.sections.faq_page.reponses_rapides_questions")} updatedAt="03/03/2026" sections={[
            {
                title: t("app.sections.faq_page.comment_create_my"),
                paragraphs: [
                    t("app.sections.faq_page.utilisez_atelier_blend"),
                    t("app.sections.faq_page.mode_infusion_base"),
                ],
            },
            {
                title: t("app.sections.faq_page.quels_payments_acceptez"),
                paragraphs: [t("app.sections.faq_page.payment_online_secure")],
            },
            {
                title: t("app.sections.faq_page.then_suivre_my"),
                paragraphs: [
                    t("app.sections.faq_page.oui_que_parcel"),
                ],
            },
            {
                title: t("app.sections.faq_page.comment_gerer_my"),
                bullets: [
                    t("app.sections.faq_page.signup_footer_consentement"),
                    t("app.sections.faq_page.desinscription_footer_link"),
                    t("app.sections.faq_page.management_complete_preferences"),
                ],
            },
            {
                title: t("app.sections.faq_page.rencontre_probleme_my"),
                paragraphs: [
                    t("app.sections.faq_page.contactez_nous_numero"),
                ],
            },
        ]}/>);
}

