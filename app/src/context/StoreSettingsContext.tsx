import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type StoreSettings } from '@/api/client';
import { t } from '@/lib/i18n';

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  id: 'default',
  freeShippingThresholdCents: 4500,
  defaultShippingCents: 590,
  frHomeShippingCents: 550,
  frRelayShippingCents: 460,
  beHomeShippingCents: 900,
  beRelayShippingCents: 550,
  europeShippingCents: 750,
  internationalShippingCents: 1590,
  currency: 'EUR',
  shopAddress: t('app.shared.store_settings.default_shop_address'),
  shopPhone: t('app.shared.store_settings.default_shop_phone'),
  contactEmail: t('app.shared.store_settings.default_contact_email'),
};

type StoreSettingsContextValue = {
  settings: StoreSettings;
  isLoading: boolean;
};

const StoreSettingsContext = createContext<StoreSettingsContextValue>({
  settings: DEFAULT_STORE_SETTINGS,
  isLoading: true,
});

export function StoreSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const response = await api.getStoreSettings();
        if (cancelled) return;
        setSettings({
          ...DEFAULT_STORE_SETTINGS,
          ...response,
          shopAddress: response?.shopAddress || DEFAULT_STORE_SETTINGS.shopAddress,
          shopPhone: response?.shopPhone || DEFAULT_STORE_SETTINGS.shopPhone,
          contactEmail: response?.contactEmail || DEFAULT_STORE_SETTINGS.contactEmail,
        });
      } catch {
        if (!cancelled) {
          setSettings(DEFAULT_STORE_SETTINGS);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StoreSettingsContext.Provider value={{ settings, isLoading }}>
      {children}
    </StoreSettingsContext.Provider>
  );
}

export function useStoreSettings() {
  return useContext(StoreSettingsContext);
}
