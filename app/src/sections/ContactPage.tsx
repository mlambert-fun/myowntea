import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, Clock3, Package, Leaf, CircleHelp, Send, MapPin } from 'lucide-react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { PageBreadcrumb } from '@/components/routing/PageBreadcrumb';
import { useAuth } from '@/context/AuthContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { api } from '@/api/client';
import { showToast } from '@/lib/toast';
import { t } from "@/lib/i18n";

type ContactSubjectOption = {
    value: string;
    label: string;
};

export default function ContactPage() {
    const { customer } = useAuth();
    const { settings } = useStoreSettings();
    const [searchParams] = useSearchParams();
    const requestedSubject = searchParams.get('subject')?.trim() || '';
    const requestedOrderNumber = searchParams.get('orderNumber')?.trim() || '';
    const subjectOptions = useMemo<ContactSubjectOption[]>(() => ([
        { value: 'ORDER', label: t("app.sections.contact_page.subject_order") },
        { value: 'PRODUCT', label: t("app.sections.contact_page.subject_product") },
        { value: 'INGREDIENT', label: t("app.sections.contact_page.subject_ingredient") },
        { value: 'ACCOUNT', label: t("app.sections.contact_page.subject_account") },
        { value: 'PARTNERSHIP', label: t("app.sections.contact_page.subject_partnership") },
        { value: 'GENERAL', label: t("app.sections.contact_page.subject_general") },
    ]), []);
    const resolvedInitialSubject = useMemo(() => {
        const matchedByValue = subjectOptions.find((option) => option.value === requestedSubject.toUpperCase());
        if (matchedByValue) {
            return matchedByValue.value;
        }
        const matched = subjectOptions.find((option) => option.label === requestedSubject);
        return matched?.value || 'GENERAL';
    }, [requestedSubject, subjectOptions]);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState(resolvedInitialSubject);
    const [orderNumber, setOrderNumber] = useState(requestedOrderNumber);
    const [message, setMessage] = useState('');
    const [submitState, setSubmitState] = useState<'idle' | 'sending'>('idle');
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitMessage, setSubmitMessage] = useState<string | null>(null);
    const selectedSubjectLabel = subjectOptions.find((option) => option.value === subject)?.label || t("app.sections.contact_page.subject_general");

    useEffect(() => {
        setSubject(resolvedInitialSubject);
    }, [resolvedInitialSubject]);

    useEffect(() => {
        if (requestedOrderNumber) {
            setOrderNumber((prev) => prev || requestedOrderNumber);
        }
    }, [requestedOrderNumber]);

    useEffect(() => {
        const nextFullName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim();
        if (nextFullName) {
            setFullName((prev) => prev || nextFullName);
        }
        if (customer?.email) {
            setEmail((prev) => prev || customer.email || '');
        }
    }, [customer?.email, customer?.firstName, customer?.lastName]);

    return (<div className="min-h-screen bg-[var(--cream-apothecary)]">
      <Navigation />
      <main className="pt-28 pb-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <PageBreadcrumb />
          <div className="mb-10">
            <h1 className="font-display text-4xl text-[var(--sage-deep)]">{t("app.sections.contact_page.page_title")}</h1>
            <p className="mt-4 text-base leading-7 text-[var(--sage-deep)]/75">{t("app.sections.contact_page.equipe_vous_accompagne")}</p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 md:items-start xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow sm:p-8">
              <div className="mb-8">
                <h2 className="font-display text-2xl text-[var(--sage-deep)]">{t("app.sections.contact_page.form_title")}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--sage-deep)]/70">{t("app.sections.contact_page.form_intro")}</p>
              </div>

              <form className="space-y-5" onSubmit={async (event) => {
            event.preventDefault();
            setSubmitError(null);
            setSubmitMessage(null);
            setSubmitState('sending');
            try {
                const response = await api.sendContactMessage({
                    fullName: fullName.trim(),
                    email: email.trim(),
                    subject: selectedSubjectLabel,
                    orderNumber: orderNumber.trim(),
                    message: message.trim(),
                    source: 'CONTACT_PAGE',
                });
                const successMessage = response.message || t("app.sections.contact_page.success_message");
                setSubmitMessage(successMessage);
                setOrderNumber('');
                setMessage('');
                showToast(successMessage, 'success');
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : t("app.sections.contact_page.error_message");
                setSubmitError(errorMessage);
                showToast(errorMessage, 'error');
            }
            finally {
                setSubmitState('idle');
            }
        }}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.full_name")}</span>
                    <input className="w-full rounded-xl border border-[#EEE6D8] bg-[#F6F2EA] px-4 py-3 text-sm text-[var(--sage-deep)] outline-none transition placeholder:text-[var(--sage-deep)]/35 focus:border-[var(--gold-antique)] focus:bg-white" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("app.sections.contact_page.full_name_placeholder")} required/>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.email")}</span>
                    <input className="w-full rounded-xl border border-[#EEE6D8] bg-[#F6F2EA] px-4 py-3 text-sm text-[var(--sage-deep)] outline-none transition placeholder:text-[var(--sage-deep)]/35 focus:border-[var(--gold-antique)] focus:bg-white" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("app.sections.contact_page.email_placeholder")} required/>
                  </label>
                </div>

                <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.subject")}</span>
                    <select className="w-full rounded-xl border border-[#EEE6D8] bg-[#F6F2EA] px-4 py-3 text-sm text-[var(--sage-deep)] outline-none transition focus:border-[var(--gold-antique)] focus:bg-white" value={subject} onChange={(event) => setSubject(event.target.value)}>
                      {subjectOptions.map((option) => (<option key={option.value} value={option.value}>
                          {option.label}
                        </option>))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.order_number")}</span>
                    <input className="w-full rounded-xl border border-[#EEE6D8] bg-[#F6F2EA] px-4 py-3 text-sm text-[var(--sage-deep)] outline-none transition placeholder:text-[var(--sage-deep)]/35 focus:border-[var(--gold-antique)] focus:bg-white" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder={t("app.sections.contact_page.order_number_placeholder")}/>
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.message")}</span>
                  <textarea className="min-h-[180px] w-full rounded-xl border border-[#EEE6D8] bg-[#F6F2EA] px-4 py-3 text-sm leading-6 text-[var(--sage-deep)] outline-none transition placeholder:text-[var(--sage-deep)]/35 focus:border-[var(--gold-antique)] focus:bg-white" value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("app.sections.contact_page.message_placeholder")} required/>
                </label>

                {submitError ? (<p className="text-sm text-red-600">{submitError}</p>) : null}
                {submitMessage && !submitError ? (<p className="text-sm text-[#2F6B3B]">{submitMessage}</p>) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button type="submit" disabled={submitState === 'sending'} className="btn-secondary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 px-8">
                    <Send className="h-4 w-4"/>
                    {submitState === 'sending' ? t("app.sections.contact_page.sending") : t("app.sections.contact_page.send_email_cta")}
                  </button>
                </div>
              </form>
            </section>

            <aside className="space-y-4 md:sticky md:top-28">
              <div className="rounded-[2rem] border border-[#E5E0D5] bg-white p-6 shadow-sm sm:p-7">
                <h2 className="font-display text-2xl text-[var(--sage-deep)]">{t("app.sections.contact_page.support_title")}</h2>
                <div className="mt-3 space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cream-apothecary)] text-[var(--gold-antique)]">
                      <Mail className="h-5 w-5"/>
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.email_title")}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--sage-deep)]/72">{t("app.sections.contact_page.email_body")}</p>
                      <span className="mt-2 inline-flex text-sm font-medium text-[var(--gold-antique)]">{settings.contactEmail}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cream-apothecary)] text-[var(--gold-antique)]">
                      <Clock3 className="h-5 w-5"/>
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.response_time_title")}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--sage-deep)]/72">{t("app.sections.contact_page.lundi_vendredi_heure")}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cream-apothecary)] text-[var(--gold-antique)]">
                      <Package className="h-5 w-5"/>
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.order_help_title")}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--sage-deep)]/72">{t("app.sections.contact_page.order_help_body")}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cream-apothecary)] text-[var(--gold-antique)]">
                      <Leaf className="h-5 w-5"/>
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.ingredient_request_title")}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--sage-deep)]/72">{t("app.sections.contact_page.ingredient_request_body")}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cream-apothecary)] text-[var(--gold-antique)]">
                      <MapPin className="h-5 w-5"/>
                    </div>
                    <div>
                      <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.address")}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--sage-deep)]/72">{t("app.sections.contact_page.own_tea_rue", undefined, { shopAddress: settings.shopAddress })}</p>
                    </div>
                  </div>
                  <div className="border-t border-[#EEE6D8] pt-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--cream-apothecary)] text-[var(--gold-antique)]">
                        <CircleHelp className="h-5 w-5"/>
                      </div>
                      <div>
                        <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.contact_page.before_contact_title")}</h3>
                        <p className="mt-1 text-sm leading-6 text-[var(--sage-deep)]/72">{t("app.sections.contact_page.before_contact_body")}</p>
                        <Link to="/faq" className="mt-3 inline-flex text-sm font-medium text-[var(--gold-antique)] hover:underline">{t("app.sections.contact_page.consult_faq_cta")}</Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>);
}
