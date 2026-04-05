import { InfoPageLayout } from './InfoPageLayout';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { t } from "@/lib/i18n";
export default function PolitiqueConfidentialitePage() {
    const { settings } = useStoreSettings();
    return (<InfoPageLayout title={t("app.sections.politique_confidentialite_page.politique_privacy")} intro={t("app.sections.politique_confidentialite_page.intro")} updatedAt="01/04/2026" sections={[
            {
                title: t("app.sections.politique_confidentialite_page.controller_title"),
                paragraphs: [
                    t("app.sections.politique_confidentialite_page.controller_p1"),
                    t("app.sections.politique_confidentialite_page.controller_p2"),
                ],
                bullets: [
                    t("app.sections.politique_confidentialite_page.controller_b1", undefined, { contactEmail: settings.contactEmail }),
                    t("app.sections.politique_confidentialite_page.controller_b2", undefined, { shopAddress: settings.shopAddress }),
                    t("app.sections.politique_confidentialite_page.controller_b3", undefined, { shopPhone: settings.shopPhone }),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.donnees_collectees"),
                bullets: [
                    t("app.sections.politique_confidentialite_page.data_b1"),
                    t("app.sections.politique_confidentialite_page.data_b2"),
                    t("app.sections.politique_confidentialite_page.data_b3"),
                    t("app.sections.politique_confidentialite_page.data_b4"),
                    t("app.sections.politique_confidentialite_page.data_b5"),
                    t("app.sections.politique_confidentialite_page.data_b6"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.finalites"),
                paragraphs: [t("app.sections.politique_confidentialite_page.purposes_p1")],
                bullets: [
                    t("app.sections.politique_confidentialite_page.purposes_b1"),
                    t("app.sections.politique_confidentialite_page.purposes_b2"),
                    t("app.sections.politique_confidentialite_page.purposes_b3"),
                    t("app.sections.politique_confidentialite_page.purposes_b4"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.recipients_title"),
                paragraphs: [
                    t("app.sections.politique_confidentialite_page.recipients_p1"),
                    t("app.sections.politique_confidentialite_page.recipients_p2"),
                ],
                bullets: [
                    t("app.sections.politique_confidentialite_page.recipients_b1"),
                    t("app.sections.politique_confidentialite_page.recipients_b2"),
                    t("app.sections.politique_confidentialite_page.recipients_b3"),
                    t("app.sections.politique_confidentialite_page.recipients_b4"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.retention_title"),
                paragraphs: [t("app.sections.politique_confidentialite_page.retention_p1")],
                bullets: [
                    t("app.sections.politique_confidentialite_page.retention_b1"),
                    t("app.sections.politique_confidentialite_page.retention_b2"),
                    t("app.sections.politique_confidentialite_page.retention_b3"),
                    t("app.sections.politique_confidentialite_page.retention_b4"),
                    t("app.sections.politique_confidentialite_page.retention_b5"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.droits"),
                paragraphs: [
                    t("app.sections.politique_confidentialite_page.rights_p1"),
                    t("app.sections.politique_confidentialite_page.rights_p2"),
                ],
                bullets: [
                    t("app.sections.politique_confidentialite_page.rights_b1"),
                    t("app.sections.politique_confidentialite_page.rights_b2"),
                    t("app.sections.politique_confidentialite_page.rights_b3", undefined, { contactEmail: settings.contactEmail }),
                    t("app.sections.politique_confidentialite_page.rights_b4"),
                ],
            },
            {
                title: t("app.sections.politique_confidentialite_page.cookies_title"),
                paragraphs: [
                    t("app.sections.politique_confidentialite_page.cookies_p1"),
                    t("app.sections.politique_confidentialite_page.cookies_p2"),
                ],
                bullets: [
                    t("app.sections.politique_confidentialite_page.cookies_b1"),
                    t("app.sections.politique_confidentialite_page.cookies_b2"),
                    t("app.sections.politique_confidentialite_page.cookies_b3"),
                ],
            },
        ]}/>);
}
