import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
const discountBaseSchema = z.object({
    title: z.string().min(2, 'Titre requis'),
    method: z.enum(['AUTOMATIC', 'CODE']),
    code: z.string().optional(),
    type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING', 'BOGO', 'TIERED', 'BUNDLE', 'SALE_PRICE', 'SUBSCRIPTION', 'GIFT']),
    value: z.string().optional(),
    configJson: z.string().optional(),
    minSubtotal: z.string().optional(),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    usageLimitEnabled: z.boolean(),
    usageLimitTotal: z.string().optional(),
    usageLimitPerCustomer: z.string().optional(),
    stackable: z.boolean(),
    firstOrderOnly: z.boolean(),
    status: z.enum(['ACTIVE', 'DRAFT', 'EXPIRED']),
});
type DiscountFormState = z.infer<typeof discountBaseSchema>;
const discountSchema = discountBaseSchema.superRefine((data: DiscountFormState, ctx: z.RefinementCtx) => {
    const advancedTypes = ['BOGO', 'TIERED', 'BUNDLE', 'SALE_PRICE', 'SUBSCRIPTION', 'GIFT'] as const;
    if (data.method === 'CODE' && (!data.code || data.code.trim().length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Code requis', path: ['code'] });
    }
    if (data.type === 'PERCENTAGE') {
        const value = Number(data.value);
        if (!value || value <= 0 || value > 100) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pourcentage invalide', path: ['value'] });
        }
    }
    if (data.type === 'FIXED') {
        const value = Number(data.value);
        if (!value || value <= 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Montant invalide', path: ['value'] });
        }
    }
    if (advancedTypes.includes(data.type as (typeof advancedTypes)[number])) {
        if (!data.configJson || data.configJson.trim().length === 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("admin.pages.discount_form.configuration_json_requise"), path: ['configJson'] });
        }
        else {
            try {
                const parsed = JSON.parse(data.configJson);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La configuration doit ?tre un objet JSON', path: ['configJson'] });
                }
            }
            catch {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'JSON invalide', path: ['configJson'] });
            }
        }
    }
    if (data.usageLimitEnabled) {
        const total = data.usageLimitTotal ? Number(data.usageLimitTotal) : 0;
        if (data.usageLimitTotal && total <= 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Limite totale invalide', path: ['usageLimitTotal'] });
        }
        if (data.usageLimitPerCustomer) {
            const perCustomer = Number(data.usageLimitPerCustomer);
            if (perCustomer <= 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Limite par client invalide', path: ['usageLimitPerCustomer'] });
            }
        }
    }
});
const emptyForm: DiscountFormState = {
    title: '',
    method: 'AUTOMATIC',
    code: '',
    type: 'PERCENTAGE',
    value: '',
    configJson: '',
    minSubtotal: '',
    startAt: '',
    endAt: '',
    usageLimitEnabled: false,
    usageLimitTotal: '',
    usageLimitPerCustomer: '',
    stackable: false,
    firstOrderOnly: false,
    status: 'DRAFT',
};
const ADVANCED_CONFIG_PLACEHOLDER = `{
  "BOGO": {
    "buyQty": 1,
    "getQty": 1,
    "target": {
      "itemTypes": ["VARIANT"],
      "excludeItemTypes": ["PACK"],
      "productIds": ["prod_xxx"],
      "variantIds": ["var_xxx"],
      "subscriptionPlanIds": ["plan_xxx"],
      "includeGiftItems": false
    }
  },
  "TIERED": {
    "target": { "itemTypes": ["VARIANT", "PACK"] },
    "tiers": [
      { "minQty": 2, "percent": 10 },
      { "minQty": 4, "percent": 15 },
      { "minSubtotalCents": 5000, "fixedCents": 1200 }
    ]
  },
  "BUNDLE_percentOff": {
    "requiredQty": 3,
    "percentOff": 20,
    "target": { "variantIds": ["var_a", "var_b", "var_c"] }
  },
  "BUNDLE_bundlePriceCents": {
    "requiredQty": 2,
    "bundlePriceCents": 1500,
    "target": { "productIds": ["prod_packable"] }
  },
  "BUNDLE_fixedOffCents": {
    "requiredQty": 2,
    "fixedOffCents": 500,
    "target": { "itemTypes": ["VARIANT"] }
  },
  "SALE_PRICE_saleUnitPriceCents": {
    "saleUnitPriceCents": 790,
    "target": { "variantIds": ["var_sale"] }
  },
  "SALE_PRICE_percentOff": {
    "percentOff": 12,
    "target": { "productIds": ["prod_sale"] }
  },
  "SALE_PRICE_fixedOffCents": {
    "fixedOffCents": 250,
    "target": { "itemTypes": ["PACK"] }
  },
  "SUBSCRIPTION_percentOff": {
    "percentOff": 10,
    "subscriptionPlanIds": ["plan_monthly"]
  },
  "SUBSCRIPTION_fixedOffCents": {
    "fixedOffCents": 500,
    "subscriptionPlanIds": ["plan_quarterly"]
  },
  "GIFT_monetary": {
    "giftValueCents": 490,
    "triggerMinimumSubtotalCents": 3000,
    "triggerProductIds": ["prod_trigger"],
    "triggerVariantIds": ["var_trigger"],
    "triggerQty": 2,
    "repeatPerTrigger": true,
    "maxGiftQty": 2,
    "giftTarget": { "itemTypes": ["VARIANT"] }
  },
  "GIFT_autoItem_variant": {
    "giftVariantId": "var_gift",
    "triggerMinimumSubtotalCents": 3500,
    "triggerQty": 1,
    "maxGiftQty": 1
  },
  "GIFT_autoItem_product": {
    "giftProductId": "prod_gift",
    "triggerProductIds": ["prod_trigger"],
    "triggerQty": 1,
    "giftQty": 1
  }
}`;
export default function DiscountFormPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [form, setForm] = useState<DiscountFormState>(emptyForm);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(Boolean(id));
    const [saving, setSaving] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);
    useEffect(() => {
        const load = async () => {
            if (!id)
                return;
            try {
                setLoading(true);
                const discount = await api.getDiscount(id);
                setForm({
                    title: discount.title || '',
                    method: discount.method || 'AUTOMATIC',
                    code: discount.code || '',
                    type: discount.type || 'PERCENTAGE',
                    value: discount.type === 'PERCENTAGE'
                        ? String(discount.valuePercent || '')
                        : discount.type === 'FIXED'
                            ? String((discount.valueCents || 0) / 100)
                            : '',
                    configJson: discount.config ? JSON.stringify(discount.config, null, 2) : '',
                    minSubtotal: discount.minimumSubtotalCents ? String(discount.minimumSubtotalCents / 100) : '',
                    startAt: discount.startAt ? discount.startAt.slice(0, 16) : '',
                    endAt: discount.endAt ? discount.endAt.slice(0, 16) : '',
                    usageLimitEnabled: Boolean(discount.usageLimitTotal || discount.usageLimitPerCustomer),
                    usageLimitTotal: discount.usageLimitTotal ? String(discount.usageLimitTotal) : '',
                    usageLimitPerCustomer: discount.usageLimitPerCustomer ? String(discount.usageLimitPerCustomer) : '',
                    stackable: Boolean(discount.stackable),
                    firstOrderOnly: Boolean(discount.firstOrderOnly),
                    status: discount.status || 'DRAFT',
                });
            }
            catch (e) {
                setApiError(t("admin.pages.discount_form.failed_load_discount"));
            }
            finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);
    const handleChange = (field: keyof DiscountFormState, value: string | boolean) => {
        setForm((prev: DiscountFormState) => ({ ...prev, [field]: value }));
    };
    const payload = useMemo(() => {
        const minimumSubtotalCents = form.minSubtotal ? Math.round(Number(form.minSubtotal) * 100) : 0;
        let parsedConfig: Record<string, unknown> | null = null;
        if (form.configJson && form.configJson.trim().length > 0) {
            try {
                parsedConfig = JSON.parse(form.configJson);
            }
            catch {
                parsedConfig = null;
            }
        }
        return {
            title: form.title.trim(),
            method: form.method,
            code: form.method === 'CODE' ? (form.code || '').trim().toUpperCase() : null,
            type: form.type,
            valuePercent: form.type === 'PERCENTAGE' ? Number(form.value) : null,
            valueCents: form.type === 'FIXED' ? Math.round(Number(form.value) * 100) : null,
            config: parsedConfig,
            minimumSubtotalCents,
            startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
            endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
            usageLimitTotal: form.usageLimitEnabled && form.usageLimitTotal ? Number(form.usageLimitTotal) : null,
            usageLimitPerCustomer: form.usageLimitEnabled && form.usageLimitPerCustomer ? Number(form.usageLimitPerCustomer) : null,
            stackable: form.stackable,
            firstOrderOnly: form.firstOrderOnly,
            status: form.status,
        };
    }, [form]);
    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setApiError(null);
        const result = discountSchema.safeParse(form);
        if (!result.success) {
            const fieldErrors: Record<string, string> = {};
            result.error.issues.forEach((issue: z.ZodIssue) => {
                const key = issue.path[0] as string;
                if (key)
                    fieldErrors[key] = issue.message;
            });
            setErrors(fieldErrors);
            return;
        }
        setErrors({});
        try {
            setSaving(true);
            if (id) {
                await api.updateDiscount(id, payload);
            }
            else {
                await api.createDiscount(payload);
            }
            navigate('/discounts');
        }
        catch (e) {
            setApiError(t("admin.pages.discount_form.failed_save_discount"));
        }
        finally {
            setSaving(false);
        }
    };
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h2 className="admin-title">{id ? t("admin.pages.discount_form.edit_discount") : t("admin.pages.discount_form.new_discount")}</h2>
            <p className="admin-subtitle">Configurez les r?gles de r?duction.</p>
          </div>
          <Link className="admin-btn admin-btn-secondary" to="/discounts">{t("admin.pages.discount_form.back")}</Link>
        </div>

        {apiError && <div className="admin-alert admin-alert-error">{apiError}</div>}

        <div className="admin-card">
          {loading ? (<div className="admin-loading">{t("admin.pages.translations.loading")}</div>) : (<form onSubmit={onSubmit} className="admin-form">
              <div className="admin-grid-2">
                <div>
                  <label className="admin-label">Titre</label>
                  <input className="admin-input" value={form.title} onChange={(e) => handleChange('title', e.target.value)}/>
                  {errors.title && <p className="admin-error">{errors.title}</p>}
                </div>

                <div>
                  <label className="admin-label">Statut</label>
                  <select className="admin-input" value={form.status} onChange={(e) => handleChange('status', e.target.value)}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="EXPIRED">EXPIRED</option>
                  </select>
                </div>

                <div>
                  <label className="admin-label">M?thode</label>
                  <select className="admin-input" value={form.method} onChange={(e) => handleChange('method', e.target.value)}>
                    <option value="AUTOMATIC">Automatique</option>
                    <option value="CODE">Code</option>
                  </select>
                </div>

                <div>
                  <label className="admin-label">Code</label>
                  <input className="admin-input" value={form.code} onChange={(e) => handleChange('code', e.target.value.toUpperCase())} disabled={form.method !== 'CODE'}/>
                  {errors.code && <p className="admin-error">{errors.code}</p>}
                </div>

                <div>
                  <label className="admin-label">Type</label>
                  <select className="admin-input" value={form.type} onChange={(e) => handleChange('type', e.target.value)}>
                    <option value="PERCENTAGE">Pourcentage</option>
                    <option value="FIXED">Montant fixe</option>
                    <option value="FREE_SHIPPING">{t("admin.pages.discount_form.shipping_free")}</option>
                    <option value="BOGO">BOGO / 1 achete = 1 offert</option>
                    <option value="TIERED">Remise par paliers</option>
                    <option value="BUNDLE">Bundle / lot</option>
                    <option value="SALE_PRICE">Prix barre (sale price)</option>
                    <option value="SUBSCRIPTION">Abonnement (subscribe & save)</option>
                    <option value="GIFT">Cadeau offert</option>
                  </select>
                </div>

                <div>
                  <label className="admin-label">Valeur</label>
                  <input className="admin-input" value={form.value} onChange={(e) => handleChange('value', e.target.value)} disabled={form.type !== 'PERCENTAGE' && form.type !== 'FIXED'} placeholder={form.type === 'PERCENTAGE' ? '10' : '5.00'}/>
                  {errors.value && <p className="admin-error">{errors.value}</p>}
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="admin-label">Configuration JSON (types avances)</label>
                  <textarea className="admin-input" style={{ minHeight: '140px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' }} value={form.configJson} onChange={(e) => handleChange('configJson', e.target.value)} placeholder={ADVANCED_CONFIG_PLACEHOLDER}/>
                  {errors.configJson && <p className="admin-error">{errors.configJson}</p>}
                </div>

                <div>
                  <label className="admin-label">Minimum sous-total (?)</label>
                  <input className="admin-input" value={form.minSubtotal} onChange={(e) => handleChange('minSubtotal', e.target.value)} placeholder="45.00"/>
                </div>

                <div>
                  <label className="admin-label">P?riode de validit?</label>
                  <div className="admin-grid-2">
                    <input className="admin-input" type="datetime-local" value={form.startAt} onChange={(e) => handleChange('startAt', e.target.value)}/>
                    <input className="admin-input" type="datetime-local" value={form.endAt} onChange={(e) => handleChange('endAt', e.target.value)}/>
                  </div>
                </div>
              </div>

              <div className="admin-section">
                <label className="admin-label">Limites d?utilisation</label>
                <div className="admin-checkbox">
                  <input type="checkbox" checked={form.usageLimitEnabled} onChange={(e) => handleChange('usageLimitEnabled', e.target.checked)}/>
                  <span>{t("admin.pages.discount_form.activer_limits")}</span>
                </div>

                {form.usageLimitEnabled && (<div className="admin-grid-2" style={{ marginTop: '0.75rem' }}>
                    <div>
                      <label className="admin-label">Limite totale</label>
                      <input className="admin-input" value={form.usageLimitTotal} onChange={(e) => handleChange('usageLimitTotal', e.target.value)}/>
                      {errors.usageLimitTotal && <p className="admin-error">{errors.usageLimitTotal}</p>}
                    </div>
                    <div>
                      <label className="admin-label">Limite par client</label>
                      <input className="admin-input" value={form.usageLimitPerCustomer} onChange={(e) => handleChange('usageLimitPerCustomer', e.target.value)}/>
                      {errors.usageLimitPerCustomer && <p className="admin-error">{errors.usageLimitPerCustomer}</p>}
                    </div>
                  </div>)}
              </div>

              <div className="admin-section">
                <label className="admin-label">Empilement</label>
                <div className="admin-checkbox">
                  <input type="checkbox" checked={form.stackable} onChange={(e) => handleChange('stackable', e.target.checked)}/>
                  <span>Autoriser la combinaison avec d?autres r?ductions</span>
                </div>
              </div>

              <div className="admin-section">
                <label className="admin-label">Eligibilite</label>
                <div className="admin-checkbox">
                  <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => handleChange('firstOrderOnly', e.target.checked)}/>
                  <span>{t("admin.pages.discount_form.first_order_only")}</span>
                </div>
              </div>

              <div className="admin-actions">
                <button className="admin-btn admin-btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                <Link className="admin-btn admin-btn-secondary" to="/discounts">Annuler</Link>
              </div>
            </form>)}
        </div>
      </div>
    </Layout>);
}
