import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { api, type RedirectMatchType, type RedirectResolveResult, type RedirectRule, } from '../api/client';
import { showToast } from '../lib/toast';
import { t } from "../lib/i18n";
type FormState = {
    name: string;
    description: string;
    sourcePath: string;
    matchType: RedirectMatchType;
    targetPath: string;
    statusCode: 301 | 302;
    isActive: boolean;
    priority: string;
    countryCodes: string;
    locales: string;
    abTestPercent: string;
    abTestTargetPath: string;
    startAt: string;
    endAt: string;
};
const EMPTY_FORM: FormState = {
    name: '',
    description: '',
    sourcePath: '',
    matchType: 'EXACT',
    targetPath: '',
    statusCode: 302,
    isActive: true,
    priority: '100',
    countryCodes: '',
    locales: '',
    abTestPercent: '0',
    abTestTargetPath: '',
    startAt: '',
    endAt: '',
};
const toLocalDateTimeInput = (isoValue?: string | null) => {
    if (!isoValue)
        return '';
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime()))
        return '';
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};
const toIsoOrNull = (localValue: string) => {
    if (!localValue)
        return null;
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime()))
        return null;
    return date.toISOString();
};
const csvToList = (value: string) => value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
const formatDate = (value?: string | null) => {
    if (!value)
        return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '-';
    return date.toLocaleString('fr-FR');
};
export default function RedirectRules() {
    const [rules, setRules] = useState<RedirectRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [testPath, setTestPath] = useState('/promo');
    const [testLocale, setTestLocale] = useState('fr-FR');
    const [testCountry, setTestCountry] = useState('FR');
    const [testSeed, setTestSeed] = useState('preview-seed');
    const [testResult, setTestResult] = useState<RedirectResolveResult | null>(null);
    const [testing, setTesting] = useState(false);
    const sortedRules = useMemo(() => [...rules].sort((a, b) => {
        if (a.priority !== b.priority)
            return a.priority - b.priority;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    }), [rules]);
    async function loadRules() {
        try {
            setLoading(true);
            const data = await api.getRedirectRules();
            setRules(Array.isArray(data) ? data : []);
        }
        catch (error) {
            showToast(error instanceof Error ? error.message : t("admin.pages.redirect_rules.failed_load_rules"), 'error');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadRules();
    }, []);
    function resetForm() {
        setEditingId(null);
        setForm(EMPTY_FORM);
    }
    function editRule(rule: RedirectRule) {
        setEditingId(rule.id);
        setForm({
            name: rule.name || '',
            description: rule.description || '',
            sourcePath: rule.sourcePath || '',
            matchType: rule.matchType || 'EXACT',
            targetPath: rule.targetPath || '',
            statusCode: rule.statusCode || 302,
            isActive: Boolean(rule.isActive),
            priority: String(rule.priority ?? 100),
            countryCodes: Array.isArray(rule.countryCodes) ? rule.countryCodes.join(', ') : '',
            locales: Array.isArray(rule.locales) ? rule.locales.join(', ') : '',
            abTestPercent: String(rule.abTestPercent ?? 0),
            abTestTargetPath: rule.abTestTargetPath || '',
            startAt: toLocalDateTimeInput(rule.startAt),
            endAt: toLocalDateTimeInput(rule.endAt),
        });
    }
    async function saveRule() {
        const statusCode: 301 | 302 = Number(form.statusCode) === 301 ? 301 : 302;
        const payload: Partial<RedirectRule> = {
            name: form.name.trim(),
            description: form.description.trim() || null,
            sourcePath: form.sourcePath.trim(),
            matchType: form.matchType,
            targetPath: form.targetPath.trim(),
            statusCode,
            isActive: form.isActive,
            priority: Number(form.priority),
            countryCodes: csvToList(form.countryCodes),
            locales: csvToList(form.locales),
            abTestPercent: Number(form.abTestPercent),
            abTestTargetPath: form.abTestTargetPath.trim() || null,
            startAt: toIsoOrNull(form.startAt),
            endAt: toIsoOrNull(form.endAt),
        };
        try {
            setSaving(true);
            if (editingId) {
                await api.updateRedirectRule(editingId, payload);
                showToast(t("admin.pages.redirect_rules.rule_update_day"), 'success');
            }
            else {
                await api.createRedirectRule(payload);
                showToast(t("admin.pages.redirect_rules.rule_created"), 'success');
            }
            resetForm();
            await loadRules();
        }
        catch (error) {
            showToast(error instanceof Error ? error.message : t("admin.pages.redirect_rules.save_failed"), 'error');
        }
        finally {
            setSaving(false);
        }
    }
    async function deleteRule(id: string) {
        if (!window.confirm(t("admin.pages.redirect_rules.delete_rule_redirect")))
            return;
        try {
            setDeletingId(id);
            await api.deleteRedirectRule(id);
            showToast(t("admin.pages.redirect_rules.rule_supprimee"), 'success');
            if (editingId === id)
                resetForm();
            await loadRules();
        }
        catch (error) {
            showToast(error instanceof Error ? error.message : t("admin.pages.redirect_rules.delete_failed"), 'error');
        }
        finally {
            setDeletingId(null);
        }
    }
    async function testResolve() {
        if (!testPath.trim()) {
            showToast(t("admin.pages.redirect_rules.chemin_test_required"), 'error');
            return;
        }
        try {
            setTesting(true);
            const result = await api.resolveRedirectRule({
                path: testPath.trim(),
                locale: testLocale.trim() || undefined,
                countryCode: testCountry.trim() || undefined,
                seed: testSeed.trim() || undefined,
            });
            setTestResult(result);
        }
        catch (error) {
            showToast(error instanceof Error ? error.message : t("admin.pages.redirect_rules.test_failed"), 'error');
        }
        finally {
            setTesting(false);
        }
    }
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">{t("admin.pages.redirect_rules.setup_redirects")}</h1>
            <p className="admin-subtitle">{t("admin.pages.redirect_rules.seo_campagnes_maintenance")}</p>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={() => void loadRules()} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Actualiser
          </button>
        </div>

        <div className="admin-card admin-premium-card">
          <h2 className="admin-card-title">{editingId ? t("admin.pages.redirect_rules.edit_rule") : t("admin.pages.redirect_rules.new_rule")}</h2>
          <p className="admin-muted admin-premium-card-subtitle">{t("admin.pages.redirect_rules.priority_faible_forte")}</p>
          <div className="admin-premium-form-grid">
            <div>
              <label className="admin-label">Nom</label>
              <input className="admin-input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder={t("admin.pages.redirect_rules.redirect_promo_summer")}/>
            </div>
            <div>
              <label className="admin-label">Description</label>
              <input className="admin-input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Optionnel"/>
            </div>
            <div>
              <label className="admin-label">Source</label>
              <input className="admin-input" value={form.sourcePath} onChange={(event) => setForm((prev) => ({ ...prev, sourcePath: event.target.value }))} placeholder="/promo"/>
            </div>
            <div>
              <label className="admin-label">{t("admin.pages.redirect_rules.type_matching")}</label>
              <select className="admin-input" value={form.matchType} onChange={(event) => setForm((prev) => ({
            ...prev,
            matchType: (event.target.value as RedirectMatchType) || 'EXACT',
        }))}>
                <option value="EXACT">EXACT</option>
                <option value="PREFIX">PREFIX</option>
                <option value="REGEX">REGEX</option>
              </select>
            </div>
            <div>
              <label className="admin-label">Cible</label>
              <input className="admin-input" value={form.targetPath} onChange={(event) => setForm((prev) => ({ ...prev, targetPath: event.target.value }))} placeholder="/collections/ete"/>
            </div>
            <div>
              <label className="admin-label">Statut HTTP</label>
              <select className="admin-input" value={form.statusCode} onChange={(event) => setForm((prev) => ({
            ...prev,
            statusCode: Number(event.target.value) === 301 ? 301 : 302,
        }))}>
                <option value={302}>302 (temporaire)</option>
                <option value={301}>301 (permanente)</option>
              </select>
            </div>
            <div>
              <label className="admin-label">{t("admin.pages.redirect_rules.priority")}</label>
              <input className="admin-input" type="number" min={0} value={form.priority} onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}/>
            </div>
            <div>
              <label className="admin-label">{t("admin.pages.redirect_rules.country_cibles_csv")}</label>
              <input className="admin-input" value={form.countryCodes} onChange={(event) => setForm((prev) => ({ ...prev, countryCodes: event.target.value }))} placeholder="FR, BE"/>
            </div>
            <div>
              <label className="admin-label">{t("admin.pages.redirect_rules.locales_targeted_csv")}</label>
              <input className="admin-input" value={form.locales} onChange={(event) => setForm((prev) => ({ ...prev, locales: event.target.value }))} placeholder="fr, fr-fr, en-gb"/>
            </div>
            <div>
              <label className="admin-label">A/B % vers variante</label>
              <input className="admin-input" type="number" min={0} max={100} value={form.abTestPercent} onChange={(event) => setForm((prev) => ({ ...prev, abTestPercent: event.target.value }))}/>
            </div>
            <div>
              <label className="admin-label">Cible variante A/B</label>
              <input className="admin-input" value={form.abTestTargetPath} onChange={(event) => setForm((prev) => ({ ...prev, abTestTargetPath: event.target.value }))} placeholder="/landing-b"/>
            </div>
            <div>
              <label className="admin-label">{t("admin.pages.redirect_rules.start_optionnel")}</label>
              <input className="admin-input" type="datetime-local" value={form.startAt} onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))}/>
            </div>
            <div>
              <label className="admin-label">Fin (optionnel)</label>
              <input className="admin-input" type="datetime-local" value={form.endAt} onChange={(event) => setForm((prev) => ({ ...prev, endAt: event.target.value }))}/>
            </div>
          </div>
          <div className="admin-premium-actions">
            <label className="admin-checkbox">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}/>
              <span>{t("admin.pages.redirect_rules.rule_active")}</span>
            </label>
            <button className="admin-btn admin-btn-primary" onClick={() => void saveRule()} disabled={saving}>
              {saving ? 'Enregistrement...' : editingId ? t("admin.pages.redirect_rules.mettre_day") : t("admin.pages.redirect_rules.create")}
            </button>
            <button className="admin-btn admin-btn-secondary" onClick={resetForm} disabled={saving}>{t("admin.pages.redirect_rules.reset")}</button>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">{t("admin.pages.redirect_rules.test_resolution")}</h2>
          <div className="admin-premium-form-grid" style={{ marginTop: '0.75rem' }}>
            <input className="admin-input" placeholder="Chemin (ex: /checkout)" value={testPath} onChange={(event) => setTestPath(event.target.value)}/>
            <input className="admin-input" placeholder="Locale (ex: fr-FR)" value={testLocale} onChange={(event) => setTestLocale(event.target.value)}/>
            <input className="admin-input" placeholder="Pays (ex: FR)" value={testCountry} onChange={(event) => setTestCountry(event.target.value)}/>
            <input className="admin-input" placeholder="Seed A/B" value={testSeed} onChange={(event) => setTestSeed(event.target.value)}/>
          </div>
          <div className="admin-premium-actions">
            <button className="admin-btn admin-btn-secondary" onClick={() => void testResolve()} disabled={testing}>
              {testing ? 'Test...' : t("admin.pages.redirect_rules.test_rule_appliquee")}
            </button>
            {testResult && (<span className="admin-muted">
                {testResult.matched
                ? `Match ${testResult.statusCode} -> ${testResult.targetPath}`
                : t("admin.pages.redirect_rules.none_redirect_trouvee")}
              </span>)}
          </div>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">{t("admin.pages.redirect_rules.rules_existantes")}</h2>
          <div className="admin-table-wrapper" style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Source</th>
                  <th>Cible</th>
                  <th>Conditions</th>
                  <th>{t("admin.pages.redirect_rules.priority")}</th>
                  <th>Statut</th>
                  <th>{t("admin.pages.redirect_rules.last_update")}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRules.map((rule) => (<tr key={rule.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{rule.name}</div>
                      {rule.description && <div className="admin-muted" style={{ fontSize: '0.8rem' }}>{rule.description}</div>}
                    </td>
                    <td>
                      <code>{rule.matchType}</code> {rule.sourcePath}
                    </td>
                    <td>
                      <div>{rule.targetPath}</div>
                      {rule.abTestPercent > 0 && rule.abTestTargetPath && (<div className="admin-muted" style={{ fontSize: '0.8rem' }}>
                          A/B {rule.abTestPercent}% {'->'} {rule.abTestTargetPath}
                        </div>)}
                    </td>
                    <td>
                      <div>{(rule.countryCodes || []).length ? `Pays: ${rule.countryCodes.join(', ')}` : 'Tous pays'}</div>
                      <div className="admin-muted" style={{ fontSize: '0.8rem' }}>
                        {(rule.locales || []).length ? `Locales: ${rule.locales.join(', ')}` : 'Toutes locales'}
                      </div>
                      <div className="admin-muted" style={{ fontSize: '0.8rem' }}>{t("admin.pages.redirect_rules.window")}{rule.startAt ? formatDate(rule.startAt) : '-'} {'->'} {rule.endAt ? formatDate(rule.endAt) : '-'}
                      </div>
                    </td>
                    <td>{rule.priority}</td>
                    <td>
                      <span className="admin-badge" style={{ background: rule.isActive ? '#15803d' : '#64748b', color: '#fff' }}>
                        {rule.isActive ? `${rule.statusCode} actif` : 'Inactif'}
                      </span>
                    </td>
                    <td>{formatDate(rule.updatedAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="admin-icon-button admin-btn-secondary" type="button" title={t("admin.pages.redirect_rules.edit")} aria-label={`Modifier ${rule.name}`} onClick={() => editRule(rule)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M3 21h6m10.5-10.5L9 21l-4 1 1-4L16.5 7.5l3 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button className="admin-icon-button admin-icon-button-danger" type="button" title={t("admin.pages.redirect_rules.delete")} aria-label={`Supprimer ${rule.name}`} onClick={() => void deleteRule(rule.id)} disabled={deletingId === rule.id}>
                          {deletingId === rule.id ? ('...') : (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M4 7h16M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>)}
                        </button>
                      </div>
                    </td>
                  </tr>))}
                {!loading && sortedRules.length === 0 && (<tr>
                    <td colSpan={8} className="admin-muted" style={{ textAlign: 'center' }}>{t("admin.pages.redirect_rules.none_rule_configuree")}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>);
}
