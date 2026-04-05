import { InfoPageLayout } from './InfoPageLayout';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { t } from "@/lib/i18n";
export default function ConditionsGeneralesPage() {
    const { settings } = useStoreSettings();
    return (<InfoPageLayout title={t("app.sections.conditions_generales_page.terms_general")} intro={t("app.sections.conditions_generales_page.intro")} updatedAt="01/04/2026" sections={[
            {
                title: t("app.sections.conditions_generales_page.scope_title"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.scope_p1"),
                    t("app.sections.conditions_generales_page.scope_p2"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.scope_b1", undefined, { contactEmail: settings.contactEmail }),
                    t("app.sections.conditions_generales_page.scope_b2", undefined, { shopAddress: settings.shopAddress }),
                    t("app.sections.conditions_generales_page.scope_b3", undefined, { shopPhone: settings.shopPhone }),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.order_title"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.order_p1"),
                    t("app.sections.conditions_generales_page.order_p2"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.order_b1"),
                    t("app.sections.conditions_generales_page.order_b2"),
                    t("app.sections.conditions_generales_page.order_b3"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.personalized_title"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.personalized_p1"),
                    t("app.sections.conditions_generales_page.personalized_p2"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.personalized_b1"),
                    t("app.sections.conditions_generales_page.personalized_b2"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.price_payment"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.price_payment_p1"),
                    t("app.sections.conditions_generales_page.price_payment_p2"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.price_payment_b1"),
                    t("app.sections.conditions_generales_page.price_payment_b2"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.shipping_transfert_responsabilite"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.shipping_p1"),
                    t("app.sections.conditions_generales_page.shipping_p2"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.shipping_b1"),
                    t("app.sections.conditions_generales_page.shipping_b2"),
                    t("app.sections.conditions_generales_page.shipping_b3"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.subscription_title"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.subscription_p1"),
                    t("app.sections.conditions_generales_page.subscription_p2"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.subscription_b1"),
                    t("app.sections.conditions_generales_page.subscription_b2"),
                    t("app.sections.conditions_generales_page.subscription_b3"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.droit_retractation"),
                paragraphs: [
                    t("app.sections.conditions_generales_page.withdrawal_p1"),
                    t("app.sections.conditions_generales_page.withdrawal_p2"),
                ],
                bullets: [
                    t("app.sections.conditions_generales_page.withdrawal_b1"),
                    t("app.sections.conditions_generales_page.withdrawal_b2"),
                ],
            },
            {
                title: t("app.sections.conditions_generales_page.support_title"),
                paragraphs: [t("app.sections.conditions_generales_page.support_p1")],
                bullets: [
                    t("app.sections.conditions_generales_page.support_b1", undefined, { contactEmail: settings.contactEmail }),
                    t("app.sections.conditions_generales_page.support_b2"),
                    t("app.sections.conditions_generales_page.support_b3"),
                    t("app.sections.conditions_generales_page.support_b4"),
                ],
            },
        ]}/>);
}
