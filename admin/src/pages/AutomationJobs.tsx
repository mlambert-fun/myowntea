import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { api, type AutomationJobConfig } from '../api/client';
import { showToast } from '../lib/toast';
import { t } from "../lib/i18n";
const formatDateTime = (value: string | null) => {
    if (!value)
        return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '-';
    return date.toLocaleString('fr-FR');
};
const statusColorByCode: Record<string, string> = {
    RUNNING: '#2563eb',
    OK: '#15803d',
    SKIPPED: '#b45309',
    ERROR: '#b91c1c',
};
export default function AutomationJobs() {
    const token = localStorage.getItem('adminToken') || '';
    const [jobs, setJobs] = useState<AutomationJobConfig[]>([]);
    const [draftMinutesById, setDraftMinutesById] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    async function loadJobs() {
        try {
            setLoading(true);
            setError(null);
            const data = await api.getAutomationJobs(token);
            setJobs(Array.isArray(data) ? data : []);
            setDraftMinutesById((prev) => {
                const next = { ...prev };
                (Array.isArray(data) ? data : []).forEach((job) => {
                    if (next[job.id] === undefined) {
                        next[job.id] = String(job.intervalMinutes);
                    }
                });
                return next;
            });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t("admin.pages.automation_jobs.failed_load_jobs"));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadJobs();
    }, []);
    async function handleToggle(job: AutomationJobConfig, enabled: boolean) {
        try {
            setSavingId(job.id);
            await api.updateAutomationJob(job.id, { enabled }, token);
            showToast(t("admin.pages.automation_jobs.configuration_job_update"), 'success');
            await loadJobs();
        }
        catch (err) {
            showToast(err instanceof Error ? err.message : t("admin.pages.automation_jobs.update_day_failed"), 'error');
        }
        finally {
            setSavingId(null);
        }
    }
    async function handleSaveFrequency(job: AutomationJobConfig) {
        const raw = draftMinutesById[job.id] ?? String(job.intervalMinutes);
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            showToast(t("admin.pages.automation_jobs.frequency_must_number"), 'error');
            return;
        }
        try {
            setSavingId(job.id);
            await api.updateAutomationJob(job.id, { intervalMinutes: Math.round(parsed) }, token);
            showToast(t("admin.pages.automation_jobs.frequency_job_update"), 'success');
            await loadJobs();
        }
        catch (err) {
            showToast(err instanceof Error ? err.message : t("admin.pages.automation_jobs.update_day_failed"), 'error');
        }
        finally {
            setSavingId(null);
        }
    }
    async function handleRunNow(job: AutomationJobConfig) {
        try {
            setRunningId(job.id);
            const payload = await api.runAutomationJob(job.id, token);
            showToast(payload.result.message || t("admin.pages.automation_jobs.job_execute"), payload.result.status === 'ERROR' ? 'error' : 'success');
            await loadJobs();
        }
        catch (err) {
            showToast(err instanceof Error ? err.message : t("admin.pages.automation_jobs.execution_failed"), 'error');
            await loadJobs();
        }
        finally {
            setRunningId(null);
        }
    }
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">{t("admin.components.layout.automation_jobs")}</h1>
            <p className="admin-subtitle">{t("admin.pages.automation_jobs.monitoring_setup_tasks")}</p>
          </div>
          <button className="admin-btn admin-btn-secondary" onClick={() => void loadJobs()} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Actualiser
          </button>
        </div>

        {error && <div className="admin-alert admin-alert-error">{error}</div>}
        {loading && <div className="admin-loading">{t("admin.pages.translations.loading")}</div>}

        <div className="admin-card">
          <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Description</th>
                  <th>Actif</th>
                  <th>{t("admin.pages.automation_jobs.frequency_min")}</th>
                  <th>{t("admin.pages.automation_jobs.last_execution")}</th>
                  <th>{t("admin.pages.automation_jobs.next_execution")}</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
            const isBusy = savingId === job.id || runningId === job.id;
            const statusColor = statusColorByCode[job.lastStatus || ''] || '#6b7280';
            return (<tr key={job.id}>
                      <td style={{ fontWeight: 600 }}>{job.name}</td>
                      <td>{job.description}</td>
                      <td>
                        <label className="admin-checkbox">
                          <input type="checkbox" checked={job.enabled} disabled={isBusy} onChange={(event) => void handleToggle(job, event.target.checked)}/>
                          <span>{job.enabled ? 'Oui' : 'Non'}</span>
                        </label>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input className="admin-input" type="number" min={1} step={1} value={draftMinutesById[job.id] ?? String(job.intervalMinutes)} onChange={(event) => setDraftMinutesById((prev) => ({ ...prev, [job.id]: event.target.value }))} style={{ width: '110px' }} disabled={isBusy}/>
                          <button className="admin-icon-button admin-btn-secondary" type="button" disabled={isBusy} onClick={() => void handleSaveFrequency(job)} title={t("admin.pages.automation_jobs.save_frequency")} aria-label={`Enregistrer la fréquence du job ${job.name}`}>
                            {savingId === job.id ? ('...') : (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M5 3h11l3 3v15H5V3Zm3 0v5h7V3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                <rect x="8" y="13" width="8" height="6" stroke="currentColor" strokeWidth="1.5"/>
                              </svg>)}
                          </button>
                        </div>
                      </td>
                      <td>{formatDateTime(job.lastRunAt)}</td>
                      <td>{formatDateTime(job.nextRunAt)}</td>
                      <td>
                        <span className="admin-badge" style={{ background: statusColor, color: '#fff' }}>
                          {job.running ? 'RUNNING' : job.lastStatus || '-'}
                        </span>
                        {job.lastError && (<div className="admin-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {job.lastError}
                          </div>)}
                      </td>
                      <td>
                        <button className="admin-icon-button admin-btn-secondary" type="button" disabled={isBusy} onClick={() => void handleRunNow(job)} title={t("admin.pages.automation_jobs.run_job")} aria-label={`Lancer le job ${job.name}`}>
                          {runningId === job.id ? ('...') : (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M8 5v14l11-7L8 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                            </svg>)}
                        </button>
                      </td>
                    </tr>);
        })}
                {jobs.length === 0 && !loading && (<tr>
                    <td colSpan={8} className="admin-muted" style={{ textAlign: 'center' }}>{t("admin.pages.automation_jobs.none_job_automatique")}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>);
}
