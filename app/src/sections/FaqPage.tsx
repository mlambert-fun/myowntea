import { InfoPageLayout } from './InfoPageLayout';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { t } from "@/lib/i18n";
export default function FaqPage() {
    const { settings } = useStoreSettings();
    return (<InfoPageLayout title="FAQ" intro={t("app.sections.faq_page.intro")} updatedAt="01/04/2026" sections={[
            {
                title: t("app.sections.faq_page.q1_title"),
                paragraphs: [
                    t("app.sections.faq_page.q1_p1"),
                    t("app.sections.faq_page.q1_p2"),
                ],
            },
            {
                title: t("app.sections.faq_page.q2_title"),
                paragraphs: [t("app.sections.faq_page.q2_p1")],
            },
            {
                title: t("app.sections.faq_page.q3_title"),
                paragraphs: [t("app.sections.faq_page.q3_p1")],
            },
            {
                title: t("app.sections.faq_page.q4_title"),
                paragraphs: [t("app.sections.faq_page.q4_p1")],
            },
            {
                title: t("app.sections.faq_page.q5_title"),
                paragraphs: [t("app.sections.faq_page.q5_p1")],
            },
            {
                title: t("app.sections.faq_page.q6_title"),
                paragraphs: [t("app.sections.faq_page.q6_p1")],
            },
            {
                title: t("app.sections.faq_page.q7_title"),
                paragraphs: [t("app.sections.faq_page.q7_p1")],
            },
            {
                title: t("app.sections.faq_page.q8_title"),
                paragraphs: [t("app.sections.faq_page.q8_p1")],
            },
            {
                title: t("app.sections.faq_page.q9_title"),
                paragraphs: [t("app.sections.faq_page.q9_p1")],
            },
            {
                title: t("app.sections.faq_page.q10_title"),
                paragraphs: [t("app.sections.faq_page.q10_p1", undefined, { contactEmail: settings.contactEmail })],
            },
            {
                title: t("app.sections.faq_page.q11_title"),
                paragraphs: [t("app.sections.faq_page.q11_p1", undefined, { contactEmail: settings.contactEmail })],
            },
        ]}/>);
}
