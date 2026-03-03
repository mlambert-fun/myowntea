import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, type EmailPreferences } from '@/api/client';
import { useAuth } from '@/context/AuthContext';

const phoneRegex = /^\+[1-9]\d{1,14}$/;

const schema = z
  .object({
    salutation: z.enum(['MME', 'MR']).optional(),
    firstName: z.string().min(1, 'Prenom requis'),
    lastName: z.string().min(1, 'Nom requis'),
    birthDate: z.string().optional(),
    phoneE164: z.string().optional(),
    email: z.string().email('Email invalide'),
    changeEmail: z.boolean().optional(),
    currentPasswordForEmail: z.string().optional(),
    changePassword: z.boolean().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmNewPassword: z.string().optional(),
  })
  .refine(
    (values) => {
      if (values.phoneE164 && !phoneRegex.test(values.phoneE164)) return false;
      return true;
    },
    { message: 'Format attendu : +33612345678', path: ['phoneE164'] }
  );

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
        if (!mounted) return;
        setEmailPreferences(response.preferences || defaultPreferences);
      } catch {
        if (!mounted) return;
        setEmailPreferences(defaultPreferences);
      } finally {
        if (mounted) setPreferencesLoading(false);
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
      form.setError('currentPasswordForEmail', { message: 'Mot de passe requis' });
      return;
    }

    if (values.changePassword) {
      if (!isPasswordAuth) {
        setError("Le changement de mot de passe n'est pas disponible pour ce compte.");
        return;
      }
      if (!values.currentPassword || !values.newPassword || !values.confirmNewPassword) {
        setError('Merci de renseigner tous les champs du mot de passe.');
        return;
      }
      if (values.newPassword.length < 8) {
        setError('Le nouveau mot de passe doit contenir 8 caracteres minimum.');
        return;
      }
      if (values.newPassword !== values.confirmNewPassword) {
        setError('Les mots de passe ne correspondent pas.');
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
        await api.updateEmailPreferences({
          transactionalOptIn: true,
          marketingOptIn: Boolean(emailPreferences.marketingOptIn),
          abandonedCartOptIn: Boolean(emailPreferences.abandonedCartOptIn),
          postPurchaseOptIn: Boolean(emailPreferences.postPurchaseOptIn),
          reorderOptIn: Boolean(emailPreferences.reorderOptIn),
          winbackOptIn: Boolean(emailPreferences.winbackOptIn),
        });
      }

      await refresh();
      setStatus('Informations mises a jour.');
    } catch {
      setError('Une erreur est survenue.');
    }
  };

  return (
    <div className="rounded-2xl border border-[#EEE6D8] bg-white p-6 shadow space-y-6">
      <div>
        <h2 className="font-display text-2xl text-[var(--sage-deep)]">Mes informations</h2>
        <p className="text-sm text-[var(--sage-deep)]/60">Mettez a jour vos informations personnelles.</p>
      </div>

      {status && <div className="text-sm text-green-700">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <p className="text-sm font-medium text-[var(--sage-deep)]">Civilite *</p>
          <div className="mt-2 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="MME" {...form.register('salutation')} /> Mme
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="MR" {...form.register('salutation')} /> M.
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm text-[var(--sage-deep)]">Prenom *</label>
            <input className="input-elegant w-full" {...form.register('firstName')} />
            {form.formState.errors.firstName && (
              <p className="text-xs text-red-600 mt-1">{form.formState.errors.firstName.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm text-[var(--sage-deep)]">Nom *</label>
            <input className="input-elegant w-full" {...form.register('lastName')} />
            {form.formState.errors.lastName && (
              <p className="text-xs text-red-600 mt-1">{form.formState.errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm text-[var(--sage-deep)]">Date de naissance</label>
            <input type="date" className="input-elegant w-full" {...form.register('birthDate')} />
          </div>
          <div>
            <label className="text-sm text-[var(--sage-deep)]">Telephone</label>
            <input className="input-elegant w-full" placeholder="+33612345678" {...form.register('phoneE164')} />
            {form.formState.errors.phoneE164 && (
              <p className="text-xs text-red-600 mt-1">{form.formState.errors.phoneE164.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm text-[var(--sage-deep)]">Email</label>
          <input className="input-elegant w-full" {...form.register('email')} disabled={!form.watch('changeEmail')} />
          {form.formState.errors.email && (
            <p className="text-xs text-red-600 mt-1">{form.formState.errors.email.message}</p>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-[var(--sage-deep)]">
            <input type="checkbox" {...form.register('changeEmail')} />
            Changer mon email
          </label>
          {form.watch('changeEmail') && isPasswordAuth && (
            <div className="mt-2">
              <label className="text-sm text-[var(--sage-deep)]">Mot de passe actuel *</label>
              <input type="password" className="input-elegant w-full" {...form.register('currentPasswordForEmail')} />
              {form.formState.errors.currentPasswordForEmail && (
                <p className="text-xs text-red-600 mt-1">{form.formState.errors.currentPasswordForEmail.message}</p>
              )}
            </div>
          )}
        </div>

        {isPasswordAuth && (
          <div>
            <label className="flex items-center gap-2 text-sm text-[var(--sage-deep)]">
              <input type="checkbox" {...form.register('changePassword')} />
              Changer mon mot de passe
            </label>
            {form.watch('changePassword') && (
              <div className="mt-3 grid gap-3">
                <div>
                  <label className="text-sm text-[var(--sage-deep)]">Mot de passe actuel *</label>
                  <input type="password" className="input-elegant w-full" {...form.register('currentPassword')} />
                </div>
                <div>
                  <label className="text-sm text-[var(--sage-deep)]">Nouveau mot de passe *</label>
                  <input type="password" className="input-elegant w-full" {...form.register('newPassword')} />
                </div>
                <div>
                  <label className="text-sm text-[var(--sage-deep)]">Confirmer le nouveau mot de passe *</label>
                  <input type="password" className="input-elegant w-full" {...form.register('confirmNewPassword')} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-[#EEE6D8] bg-[#FBF8F2] p-4">
          <h3 className="font-medium text-[var(--sage-deep)]">Preferences email</h3>
          <p className="text-xs text-[var(--sage-deep)]/60">
            Gere tes emails marketing. Les emails transactionnels restent actifs.
          </p>
          {preferencesLoading && <p className="text-xs text-[var(--sage-deep)]/60 mt-2">Chargement...</p>}
          {!preferencesLoading && emailPreferences && (
            <div className="mt-3 grid gap-2 text-sm text-[var(--sage-deep)]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked disabled />
                Emails transactionnels (obligatoires)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emailPreferences.marketingOptIn)}
                  onChange={(event) =>
                    setEmailPreferences((prev) => (prev ? { ...prev, marketingOptIn: event.target.checked } : prev))
                  }
                />
                Offres et nouveautes
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emailPreferences.abandonedCartOptIn)}
                  onChange={(event) =>
                    setEmailPreferences((prev) =>
                      prev ? { ...prev, abandonedCartOptIn: event.target.checked } : prev
                    )
                  }
                />
                Relances panier abandonne
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emailPreferences.postPurchaseOptIn)}
                  onChange={(event) =>
                    setEmailPreferences((prev) =>
                      prev ? { ...prev, postPurchaseOptIn: event.target.checked } : prev
                    )
                  }
                />
                Emails post-achat (idees + avis)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emailPreferences.reorderOptIn)}
                  onChange={(event) =>
                    setEmailPreferences((prev) => (prev ? { ...prev, reorderOptIn: event.target.checked } : prev))
                  }
                />
                Rappels de reassort
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(emailPreferences.winbackOptIn)}
                  onChange={(event) =>
                    setEmailPreferences((prev) => (prev ? { ...prev, winbackOptIn: event.target.checked } : prev))
                  }
                />
                Relances inactivite
              </label>
            </div>
          )}
        </div>

        <button type="submit" className="btn-primary">
          Enregistrer
        </button>
      </form>
    </div>
  );
}
