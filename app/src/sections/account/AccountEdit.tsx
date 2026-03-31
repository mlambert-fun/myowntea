import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, type EmailPreferences } from '@/api/client';
import { PhoneField } from '@/components/forms/PhoneField';
import { useAuth } from '@/context/AuthContext';
import { t } from "@/lib/i18n";
import { DEFAULT_LOCALE_MARKET, readLocaleMarketPreference } from '@/lib/locale-market';
import { isValidPhoneE164 } from '@/lib/phone';
const schema = z
    .object({
    salutation: z.enum(['MME', 'MR']).optional(),
    firstName: z.string().min(1, t("app.sections.account.account_edit.first_name_required")),
    lastName: z.string().min(1, 'Nom requis'),
    birthDate: z.string().optional(),
    phoneE164: z.string().optional(),
    email: z.string().email(t("app.sections.account.account_edit.email_invalid")),
    changeEmail: z.boolean().optional(),
    currentPasswordForEmail: z.string().optional(),
    changePassword: z.boolean().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmNewPassword: z.string().optional(),
})
    .refine((values) => {
    if (values.phoneE164 && !isValidPhoneE164(values.phoneE164))
        return false;
    return true;
}, { message: 'Format attendu : +33612345678', path: ['phoneE164'] });
type FormValues = z.infer<typeof schema>;
const defaultPreferences: EmailPreferences = {
    transactionalOptIn: true,
    marketingOptIn: true,
    abandonedCartOptIn: true,
    postPurchaseOptIn: true,
    reorderOptIn: true,
    winbackOptIn: true,
};
export default function AccountEdit() {
    const { customer, refresh } = useAuth();
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [emailPreferences, setEmailPreferences] = useState<EmailPreferences | null>(null);
    const [preferencesLoading, setPreferencesLoading] = useState(false);
    const isPasswordAuth = customer?.authProvider === 'PASSWORD';
    const defaultPhoneCountryCode = readLocaleMarketPreference()?.countryCode || DEFAULT_LOCALE_MARKET.countryCode;
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            salutation: customer?.salutation || undefined,
            firstName: customer?.firstName || '',
            lastName: customer?.lastName || '',
            birthDate: customer?.birthDate ? customer.birthDate.slice(0, 10) : '',
            phoneE164: customer?.phoneE164 || '',
            email: customer?.email || '',
            changeEmail: false,
            currentPasswordForEmail: '',
            changePassword: false,
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: '',
        },
    });
    useEffect(() => {
        let mounted = true;
        const loadPreferences = async () => {
            setPreferencesLoading(true);
            try {
                const response = await api.getEmailPreferences();
                if (!mounted)
                    return;
                setEmailPreferences(response.preferences || defaultPreferences);
            }
            catch {
                if (!mounted)
                    return;
                setEmailPreferences(defaultPreferences);
            }
            finally {
                if (mounted)
                    setPreferencesLoading(false);
            }
        };
        void loadPreferences();
        return () => {
            mounted = false;
        };
    }, []);
    const onSubmit = async (values: FormValues) => {
        setStatus(null);
        setError(null);
        if (values.changeEmail && isPasswordAuth && !values.currentPasswordForEmail) {
            form.setError('currentPasswordForEmail', { message: t("app.sections.account.account_edit.password_required") });
            return;
        }
        if (values.changePassword) {
            if (!isPasswordAuth) {
                setError(t("app.sections.account.account_edit.changement_password_pas"));
                return;
            }
            if (!values.currentPassword || !values.newPassword || !values.confirmNewPassword) {
                setError(t("app.sections.account.account_edit.please_enter_all"));
                return;
            }
            if (values.newPassword.length < 8) {
                setError(t("app.sections.account.account_edit.new_password_must"));
                return;
            }
            if (values.newPassword !== values.confirmNewPassword) {
                setError(t("app.sections.account.account_edit.mots_password_correspondent"));
                return;
            }
        }
        try {
            await api.updateAccountProfile({
                salutation: values.salutation || null,
                firstName: values.firstName,
                lastName: values.lastName,
                birthDate: values.birthDate || null,
                phoneE164: values.phoneE164 || null,
            });
            if (values.changeEmail && values.email) {
                await api.updateAccountEmail({
                    email: values.email,
                    currentPassword: values.currentPasswordForEmail || undefined,
                });
            }
            if (values.changePassword && values.newPassword && values.currentPassword) {
                await api.updateAccountPassword({
                    currentPassword: values.currentPassword,
                    newPassword: values.newPassword,
                });
            }
            if (emailPreferences) {
                const remindersAndNudgesOptIn = Boolean(emailPreferences.abandonedCartOptIn ||
                    emailPreferences.postPurchaseOptIn ||
                    emailPreferences.reorderOptIn ||
                    emailPreferences.winbackOptIn);
                await api.updateEmailPreferences({
                    transactionalOptIn: true,
                    marketingOptIn: Boolean(emailPreferences.marketingOptIn),
                    abandonedCartOptIn: remindersAndNudgesOptIn,
                    postPurchaseOptIn: remindersAndNudgesOptIn,
                    reorderOptIn: remindersAndNudgesOptIn,
                    winbackOptIn: remindersAndNudgesOptIn,
                });
            }
            await refresh();
            setStatus(t("app.sections.account.account_edit.informations_mises_day"));
        }
        catch (error) {
            setError(error instanceof Error && error.message.trim()
                ? error.message
                : t("app.lib.api_errors.generic_error"));
        }
    };
    const remindersAndNudgesOptIn = Boolean(emailPreferences &&
        (emailPreferences.abandonedCartOptIn ||
            emailPreferences.postPurchaseOptIn ||
            emailPreferences.reorderOptIn ||
            emailPreferences.winbackOptIn));
    return (<div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow space-y-6">
      <div>
        <h2 className="font-display text-2xl text-[var(--sage-deep)]">{t("app.sections.account.account_edit.my_informations")}</h2>
        <p className="text-sm text-[var(--sage-deep)]/60">{t("app.sections.account.account_edit.mettez_day_informations")}</p>
      </div>

      {status && <div className="text-sm text-green-700">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <p className="text-sm font-medium text-[var(--sage-deep)]">{t("app.sections.account.account_edit.title")}</p>
          <div className="mt-2 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="MME" {...form.register('salutation')}/> Mme
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="MR" {...form.register('salutation')}/> M.
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.first_name")}</label>
            <input className="input-elegant w-full" {...form.register('firstName')}/>
            {form.formState.errors.firstName && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.firstName.message}</p>)}
          </div>
          <div>
            <label className="text-sm text-[var(--sage-deep)]">Nom *</label>
            <input className="input-elegant w-full" {...form.register('lastName')}/>
            {form.formState.errors.lastName && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.lastName.message}</p>)}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.date_naissance")}</label>
            <input type="date" className="input-elegant w-full" {...form.register('birthDate')}/>
          </div>
          <div>
            <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.phone")}</label>
            <input type="hidden" {...form.register('phoneE164')}/>
            <PhoneField value={form.watch('phoneE164') || ''} onChange={(nextPhoneValue) => form.setValue('phoneE164', nextPhoneValue, {
            shouldDirty: true,
            shouldValidate: form.formState.isSubmitted,
        })} autoCountryCode={defaultPhoneCountryCode} searchPlaceholder={t("app.sections.account.account_edit.phone_country_search", 'Rechercher un pays ou un indicatif')} emptyLabel={t("app.sections.account.account_edit.phone_country_empty", 'Aucun indicatif trouvé.')} placeholderFallback={t("app.sections.account.account_edit.phone_local_placeholder", '6 12 34 56 78')}/>
            {form.formState.errors.phoneE164 && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.phoneE164.message}</p>)}
          </div>
        </div>

        <div>
          <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.email_2")}</label>
          <input className="input-elegant w-full" {...form.register('email')} disabled={!form.watch('changeEmail')}/>
          {form.formState.errors.email && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.email.message}</p>)}
          <label className="mt-2 flex items-center gap-2 text-sm text-[var(--sage-deep)]">
            <input type="checkbox" {...form.register('changeEmail')}/>{t("app.sections.account.account_edit.changer_my_email")}</label>
          {form.watch('changeEmail') && isPasswordAuth && (<div className="mt-2">
              <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.password_actuel")}</label>
              <input type="password" className="input-elegant w-full" {...form.register('currentPasswordForEmail')}/>
              {form.formState.errors.currentPasswordForEmail && (<p className="text-xs text-red-600 mt-1">{form.formState.errors.currentPasswordForEmail.message}</p>)}
            </div>)}
        </div>

        {isPasswordAuth && (<div>
            <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
              <input type="checkbox" {...form.register('changePassword')}/>{t("app.sections.account.account_edit.changer_my_password")}</label>
            {form.watch('changePassword') && (<div className="mt-3 grid gap-3">
                <div>
                  <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.password_actuel")}</label>
                  <input type="password" className="input-elegant w-full" {...form.register('currentPassword')}/>
                </div>
                <div>
                  <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.new_password")}</label>
                  <input type="password" className="input-elegant w-full" {...form.register('newPassword')}/>
                </div>
                <div>
                  <label className="text-sm text-[var(--sage-deep)]">{t("app.sections.account.account_edit.confirmer_new_password")}</label>
                  <input type="password" className="input-elegant w-full" {...form.register('confirmNewPassword')}/>
                </div>
              </div>)}
          </div>)}

        <div className="rounded-xl border border-[#EEE6D8] bg-[#FBF8F2] p-4">
          <h3 className="font-medium text-[var(--sage-deep)]">{t("app.sections.account.account_edit.preferences_email")}</h3>
          <p className="text-xs text-[var(--sage-deep)]/60">{t("app.sections.account.account_edit.gere_emails_marketing")}</p>
          {preferencesLoading && <p className="text-xs text-[var(--sage-deep)]/60 mt-2">{t("app.sections.account.account_edit.loading")}</p>}
          {!preferencesLoading && emailPreferences && (<div className="mt-3 grid gap-2 text-sm text-[var(--sage-deep)]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked disabled/>
                Emails transactionnels (obligatoires)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(emailPreferences.marketingOptIn)} onChange={(event) => setEmailPreferences((prev) => (prev ? { ...prev, marketingOptIn: event.target.checked } : prev))}/>
                Emails marketing
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={remindersAndNudgesOptIn} onChange={(event) => setEmailPreferences((prev) => prev
                ? {
                    ...prev,
                    abandonedCartOptIn: event.target.checked,
                    postPurchaseOptIn: event.target.checked,
                    reorderOptIn: event.target.checked,
                    winbackOptIn: event.target.checked,
                }
                : prev)}/>{t("app.sections.account.account_edit.reminders")}</label>
            </div>)}
        </div>

        <button type="submit" className="btn-primary">
          Enregistrer
        </button>
      </form>
    </div>);
}
