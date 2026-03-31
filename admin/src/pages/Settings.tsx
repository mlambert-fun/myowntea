import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";

const formatEuro = (cents: number, currency: string) => new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency || 'EUR',
}).format((cents || 0) / 100);

export default function Settings() {
    const [formData, setFormData] = useState({
        shopAddress: '',
        shopPhone: '',
        contactEmail: '',
        freeShippingThresholdCents: '4500',
        defaultShippingCents: '550',
        frHomeShippingCents: '550',
        frRelayShippingCents: '460',
        beHomeShippingCents: '900',
        beRelayShippingCents: '550',
        europeShippingCents: '750',
        internationalShippingCents: '1590',
        currency: 'EUR',
    });
    const token = localStorage.getItem('adminToken') || '';

    useEffect(() => {
        void loadSettings();
    }, []);

    async function loadSettings() {
        try {
            const data = await api.getStoreSettings();
            if (data) {
                setFormData({
                    shopAddress: data.shopAddress || '',
                    shopPhone: data.shopPhone || '',
                    contactEmail: data.contactEmail || '',
                    freeShippingThresholdCents: String(data.freeShippingThresholdCents ?? 4500),
                    defaultShippingCents: String(data.defaultShippingCents ?? 550),
                    frHomeShippingCents: String(data.frHomeShippingCents ?? data.defaultShippingCents ?? 550),
                    frRelayShippingCents: String(data.frRelayShippingCents ?? 460),
                    beHomeShippingCents: String(data.beHomeShippingCents ?? 900),
                    beRelayShippingCents: String(data.beRelayShippingCents ?? 550),
                    europeShippingCents: String(data.europeShippingCents ?? 750),
                    internationalShippingCents: String(data.internationalShippingCents ?? 1590),
                    currency: data.currency || 'EUR',
                });
            }
        }
        catch (error) {
            console.error('Failed to load settings', error);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            await api.updateStoreSettings({
                shopAddress: formData.shopAddress.trim(),
                shopPhone: formData.shopPhone.trim(),
                contactEmail: formData.contactEmail.trim(),
                freeShippingThresholdCents: Number(formData.freeShippingThresholdCents),
                defaultShippingCents: Number(formData.defaultShippingCents),
                frHomeShippingCents: Number(formData.frHomeShippingCents),
                frRelayShippingCents: Number(formData.frRelayShippingCents),
                beHomeShippingCents: Number(formData.beHomeShippingCents),
                beRelayShippingCents: Number(formData.beRelayShippingCents),
                europeShippingCents: Number(formData.europeShippingCents),
                internationalShippingCents: Number(formData.internationalShippingCents),
                currency: formData.currency,
            }, token);
            void loadSettings();
        }
        catch (error) {
            console.error('Failed to update settings', error);
        }
    }

    const thresholdCents = useMemo(() => Math.max(0, Number(formData.freeShippingThresholdCents) || 0), [formData.freeShippingThresholdCents]);
    const defaultShippingCents = useMemo(() => Math.max(0, Number(formData.defaultShippingCents) || 0), [formData.defaultShippingCents]);
    const frHomeShippingCents = useMemo(() => Math.max(0, Number(formData.frHomeShippingCents) || 0), [formData.frHomeShippingCents]);
    const frRelayShippingCents = useMemo(() => Math.max(0, Number(formData.frRelayShippingCents) || 0), [formData.frRelayShippingCents]);
    const beHomeShippingCents = useMemo(() => Math.max(0, Number(formData.beHomeShippingCents) || 0), [formData.beHomeShippingCents]);
    const beRelayShippingCents = useMemo(() => Math.max(0, Number(formData.beRelayShippingCents) || 0), [formData.beRelayShippingCents]);
    const europeShippingCents = useMemo(() => Math.max(0, Number(formData.europeShippingCents) || 0), [formData.europeShippingCents]);
    const internationalShippingCents = useMemo(() => Math.max(0, Number(formData.internationalShippingCents) || 0), [formData.internationalShippingCents]);
    const currency = (formData.currency || 'EUR').toUpperCase();

    return (<Layout>
      <div className="admin-page admin-page-premium">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">{t("admin.pages.settings.settings_store")}</h1>
            <p className="admin-subtitle">{t("admin.pages.settings.pilotez_rules_shipping")}</p>
          </div>
        </div>

        <section className="admin-premium-kpis">
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">{t("admin.pages.settings.seuil_shipping_offerte")}</p>
            <p className="admin-premium-kpi-value">{formatEuro(thresholdCents, currency)}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">{t("admin.pages.settings.france_home")}</p>
            <p className="admin-premium-kpi-value">{formatEuro(frHomeShippingCents, currency)}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">{t("admin.pages.settings.france_pickup_point")}</p>
            <p className="admin-premium-kpi-value">{formatEuro(frRelayShippingCents, currency)}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Belgique domicile</p>
            <p className="admin-premium-kpi-value">{formatEuro(beHomeShippingCents, currency)}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Belgique point relais</p>
            <p className="admin-premium-kpi-value">{formatEuro(beRelayShippingCents, currency)}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">Devise active</p>
            <p className="admin-premium-kpi-value">{currency}</p>
          </article>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="admin-card admin-premium-card">
            <h2 className="admin-card-title">{t("admin.pages.settings.global_settings")}</h2>
            <p className="admin-muted admin-premium-card-subtitle">{t("admin.pages.settings.global_settings_help")}</p>

            <div className="admin-premium-form-grid">
              <div>
                <label className="admin-label">{t("admin.pages.settings.shop_address")}</label>
                <input className="admin-input" value={formData.shopAddress} onChange={(e) => setFormData({ ...formData, shopAddress: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">{t("admin.pages.settings.shop_phone")}</label>
                <input className="admin-input" value={formData.shopPhone} onChange={(e) => setFormData({ ...formData, shopPhone: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">{t("admin.pages.settings.contact_email")}</label>
                <input className="admin-input" type="email" value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}/>
              </div>
            </div>
          </div>

          <div className="admin-card admin-premium-card">
            <h2 className="admin-card-title">{t("admin.pages.settings.reglages_shipping")}</h2>
            <p className="admin-muted admin-premium-card-subtitle">{t("admin.pages.settings.values_alimentent_front")}</p>

            <div className="admin-premium-form-grid">
              <div>
                <label className="admin-label">{t("admin.pages.settings.seuil_shipping_offerte_2")}</label>
                <input className="admin-input" type="number" min={0} value={formData.freeShippingThresholdCents} onChange={(e) => setFormData({ ...formData, freeShippingThresholdCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">{t("admin.pages.settings.fees_default_centimes")}</label>
                <input className="admin-input" type="number" min={0} value={formData.defaultShippingCents} onChange={(e) => setFormData({ ...formData, defaultShippingCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">{t("admin.pages.settings.france_metropolitan_home")}</label>
                <input className="admin-input" type="number" min={0} value={formData.frHomeShippingCents} onChange={(e) => setFormData({ ...formData, frHomeShippingCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">{t("admin.pages.settings.france_metropolitan_pickup")}</label>
                <input className="admin-input" type="number" min={0} value={formData.frRelayShippingCents} onChange={(e) => setFormData({ ...formData, frRelayShippingCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">Belgique domicile (centimes)</label>
                <input className="admin-input" type="number" min={0} value={formData.beHomeShippingCents} onChange={(e) => setFormData({ ...formData, beHomeShippingCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">Belgique point relais (centimes)</label>
                <input className="admin-input" type="number" min={0} value={formData.beRelayShippingCents} onChange={(e) => setFormData({ ...formData, beRelayShippingCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">{t("admin.pages.settings.europe_dom_tom")}</label>
                <input className="admin-input" type="number" min={0} value={formData.europeShippingCents} onChange={(e) => setFormData({ ...formData, europeShippingCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">International (centimes)</label>
                <input className="admin-input" type="number" min={0} value={formData.internationalShippingCents} onChange={(e) => setFormData({ ...formData, internationalShippingCents: e.target.value })}/>
              </div>

              <div>
                <label className="admin-label">Devise</label>
                <input className="admin-input" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })} maxLength={3}/>
              </div>
            </div>

            <div className="admin-settings-preview">
              <p className="admin-settings-preview-label">{t("admin.pages.settings.apercu")}</p>
              <p className="admin-settings-preview-value">{t("admin.pages.settings.france_2")}<strong>{formatEuro(frHomeShippingCents, currency)}</strong>{t("admin.pages.settings.home")}{' '}
                <strong>{formatEuro(frRelayShippingCents, currency)}</strong>{t("admin.pages.settings.pickup_point_shipping")}{' '}
                <strong>{formatEuro(thresholdCents, currency)}</strong>{t("admin.pages.settings.france")}</p>
              <p className="admin-settings-preview-value">
                Europe/DOM-TOM: <strong>{formatEuro(europeShippingCents, currency)}</strong>. International:{' '}
                <strong>{formatEuro(internationalShippingCents, currency)}</strong>.
              </p>
              <p className="admin-settings-preview-value">{t("admin.pages.settings.value_repli_backend")}<strong>{formatEuro(defaultShippingCents, currency)}</strong>.
              </p>
            </div>

            <div className="admin-premium-actions">
              <button className="admin-btn admin-btn-primary" type="submit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 3h11l3 3v15H5V3Zm3 0v5h7V3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <rect x="8" y="13" width="8" height="6" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                Enregistrer
              </button>
            </div>
          </div>
        </form>
      </div>
    </Layout>);
}

