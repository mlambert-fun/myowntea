import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import {
  api,
  type EntityTranslationRow,
  type TranslatableEntityType,
  type TranslationConfigEntry,
} from '../api/client';
import { showToast } from '../lib/toast';
import { t } from '../lib/i18n';

type EditorValueKind = 'text' | 'nullable_text' | 'array' | 'json';

type EditorState = {
  entityType: TranslatableEntityType;
  entityId: string;
  locale: string;
  field: string;
  valueKind: EditorValueKind;
  valueInput: string;
};

const ENTITY_TYPE_OPTIONS: TranslatableEntityType[] = [
  'INGREDIENT',
  'PRODUCT',
  'PRODUCT_OPTION',
  'PRODUCT_OPTION_VALUE',
  'BLEND',
  'BLEND_LISTING',
];

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('fr-FR');
};

const toValuePreview = (value: unknown) => {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return '-';
    if (serialized.length <= 90) return serialized;
    return `${serialized.slice(0, 87)}...`;
  } catch {
    return '-';
  }
};

const inferEditorStateFromRow = (row: EntityTranslationRow): Pick<EditorState, 'valueKind' | 'valueInput'> => {
  if (Array.isArray(row.value)) {
    const normalized = row.value
      .map((entry) => String(entry ?? '').trim())
      .filter((entry) => entry.length > 0);
    return {
      valueKind: 'array',
      valueInput: normalized.join('\n'),
    };
  }

  if (row.value === null) {
    return {
      valueKind: 'nullable_text',
      valueInput: '',
    };
  }

  if (typeof row.value === 'string') {
    return {
      valueKind: 'text',
      valueInput: row.value,
    };
  }

  return {
    valueKind: 'json',
    valueInput: JSON.stringify(row.value, null, 2),
  };
};

const makeDefaultEditor = (
  config: TranslationConfigEntry[],
  entityType: TranslatableEntityType = 'INGREDIENT',
): EditorState => {
  const matched = config.find((entry) => entry.entityType === entityType);
  return {
    entityType,
    entityId: '',
    locale: 'fr-fr',
    field: matched?.fields?.[0] || 'name',
    valueKind: 'text',
    valueInput: '',
  };
};

export default function Translations() {
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [config, setConfig] = useState<TranslationConfigEntry[]>([]);
  const [rows, setRows] = useState<EntityTranslationRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [filters, setFilters] = useState<{
    entityType: TranslatableEntityType | '';
    entityId: string;
    locale: string;
    field: string;
  }>({
    entityType: '',
    entityId: '',
    locale: '',
    field: '',
  });

  const [editor, setEditor] = useState<EditorState>(() => makeDefaultEditor([], 'INGREDIENT'));

  const configByType = useMemo(
    () =>
      new Map<TranslatableEntityType, TranslationConfigEntry>(
        config.map((entry) => [entry.entityType, entry]),
      ),
    [config],
  );

  const allFields = useMemo(() => {
    const unique = new Set<string>();
    config.forEach((entry) => {
      entry.fields.forEach((field) => unique.add(field));
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [config]);

  const filterFieldOptions = useMemo(() => {
    if (!filters.entityType) return allFields;
    return configByType.get(filters.entityType)?.fields || [];
  }, [allFields, configByType, filters.entityType]);

  const editorFieldOptions = useMemo(
    () => configByType.get(editor.entityType)?.fields || [],
    [configByType, editor.entityType],
  );

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.entityType) parts.push(`entity=${filters.entityType}`);
    if (filters.entityId.trim()) parts.push(`id~${filters.entityId.trim()}`);
    if (filters.locale.trim()) parts.push(`locale=${filters.locale.trim()}`);
    if (filters.field.trim()) parts.push(`field=${filters.field.trim()}`);
    return parts.join(' | ');
  }, [filters.entityId, filters.entityType, filters.field, filters.locale]);

  const loadConfig = async () => {
    try {
      setLoadingConfig(true);
      const payload = await api.getTranslationsConfig();
      const entities = Array.isArray(payload.entities) ? payload.entities : [];
      setConfig(entities);
      if (entities.length > 0) {
        const currentTypeExists = entities.some((entry) => entry.entityType === editor.entityType);
        if (!currentTypeExists) {
          setEditor(makeDefaultEditor(entities, entities[0].entityType));
        } else if (!entities.find((entry) => entry.entityType === editor.entityType)?.fields.includes(editor.field)) {
          setEditor((prev) => ({
            ...prev,
            field: entities.find((entry) => entry.entityType === prev.entityType)?.fields[0] || 'name',
          }));
        }
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('admin.pages.translations.failed_load_config'),
        'error',
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadRows = async (nextPage = page) => {
    try {
      setLoadingRows(true);
      const payload = await api.getTranslations(
        {
          entityType: filters.entityType,
          entityId: filters.entityId.trim() || undefined,
          locale: filters.locale.trim() || undefined,
          field: filters.field.trim() || undefined,
          page: nextPage,
          pageSize,
        }
      );
      setRows(Array.isArray(payload.items) ? payload.items : []);
      setPage(payload.page || nextPage);
      setTotalCount(payload.totalCount || 0);
      setTotalPages(Math.max(1, payload.totalPages || 1));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('admin.pages.translations.failed_load_rows'),
        'error',
      );
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  useEffect(() => {
    void loadRows(page);
  }, [page, pageSize]);

  const refreshAll = async () => {
    await loadConfig();
    await loadRows(page);
  };

  const applyFilters = async () => {
    setPage(1);
    await loadRows(1);
  };

  const resetEditor = () => {
    setEditingId(null);
    setEditor(makeDefaultEditor(config, editor.entityType));
  };

  const startEdit = (row: EntityTranslationRow) => {
    const parsed = inferEditorStateFromRow(row);
    setEditingId(row.id);
    setEditor({
      entityType: row.entityType,
      entityId: row.entityId,
      locale: row.locale,
      field: row.field,
      valueKind: parsed.valueKind,
      valueInput: parsed.valueInput,
    });
  };

  const saveTranslation = async () => {
    const entityId = editor.entityId.trim();
    const locale = editor.locale.trim().toLowerCase();
    const field = editor.field.trim();
    if (!entityId || !locale || !field) {
      showToast(t('admin.pages.translations.missing_required_fields'), 'error');
      return;
    }

    let valuePayload: unknown;
    try {
      if (editor.valueKind === 'array') {
        valuePayload = editor.valueInput
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      } else if (editor.valueKind === 'nullable_text') {
        const normalized = editor.valueInput.trim();
        valuePayload = normalized.length > 0 ? normalized : null;
      } else if (editor.valueKind === 'json') {
        valuePayload = JSON.parse(editor.valueInput);
      } else {
        valuePayload = editor.valueInput.trim();
      }
    } catch {
      showToast(t('admin.pages.translations.invalid_json_value'), 'error');
      return;
    }

    try {
      setSaving(true);
      await api.upsertTranslations(
        {
          entityType: editor.entityType,
          entityId,
          locale,
          values: { [field]: valuePayload },
        }
      );
      showToast(t('admin.pages.translations.translation_saved'), 'success');
      await loadRows(page);
      setEditingId(null);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('admin.pages.translations.failed_save_translation'),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeTranslation = async (row: EntityTranslationRow) => {
    const confirmation = window.confirm(t('admin.pages.translations.confirm_delete_translation'));
    if (!confirmation) return;
    try {
      setDeletingId(row.id);
      await api.deleteTranslation(row.id);
      showToast(t('admin.pages.translations.translation_deleted'), 'success');
      if (editingId === row.id) {
        resetEditor();
      }
      await loadRows(page);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('admin.pages.translations.failed_delete_translation'),
        'error',
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">{t('admin.pages.translations.setup_business_translations')}</h1>
            <p className="admin-subtitle">{t('admin.pages.translations.manage_multilingual_values')}</p>
          </div>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => void refreshAll()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            disabled={loadingRows || loadingConfig}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('admin.pages.translations.refresh')}
          </button>
        </div>

        <section className="admin-premium-kpis">
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">{t('admin.pages.translations.translations_count')}</p>
            <p className="admin-premium-kpi-value">{totalCount}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">{t('admin.pages.translations.entity_types_count')}</p>
            <p className="admin-premium-kpi-value">{config.length}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">{t('admin.pages.translations.available_fields_count')}</p>
            <p className="admin-premium-kpi-value">{allFields.length}</p>
          </article>
          <article className="admin-premium-kpi-card">
            <p className="admin-muted">{t('admin.pages.translations.active_page')}</p>
            <p className="admin-premium-kpi-value">
              {page} / {totalPages}
            </p>
          </article>
        </section>

        <div className="admin-card admin-premium-card">
          <h2 className="admin-card-title">{t('admin.pages.translations.filters')}</h2>
          <p className="admin-muted admin-premium-card-subtitle">{t('admin.pages.translations.filters_subtitle')}</p>
          <div className="admin-premium-form-grid">
            <div>
              <label className="admin-label">{t('admin.pages.translations.entity_type')}</label>
              <select
                className="admin-input"
                value={filters.entityType}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    entityType: (event.target.value as TranslatableEntityType | '') || '',
                    field: '',
                  }))
                }
              >
                <option value="">{t('admin.pages.translations.all_entities')}</option>
                {ENTITY_TYPE_OPTIONS.map((entityType) => (
                  <option key={entityType} value={entityType}>
                    {entityType}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-label">{t('admin.pages.translations.entity_id')}</label>
              <input
                className="admin-input"
                placeholder={t('admin.pages.translations.entity_id_placeholder')}
                value={filters.entityId}
                onChange={(event) => setFilters((prev) => ({ ...prev, entityId: event.target.value }))}
              />
            </div>
            <div>
              <label className="admin-label">{t('admin.pages.translations.locale')}</label>
              <input
                className="admin-input"
                placeholder="fr-fr"
                value={filters.locale}
                onChange={(event) => setFilters((prev) => ({ ...prev, locale: event.target.value }))}
              />
            </div>
            <div>
              <label className="admin-label">{t('admin.pages.translations.field')}</label>
              <select
                className="admin-input"
                value={filters.field}
                onChange={(event) => setFilters((prev) => ({ ...prev, field: event.target.value }))}
              >
                <option value="">{t('admin.pages.translations.all_fields')}</option>
                {filterFieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-premium-actions">
            <button className="admin-btn admin-btn-primary" onClick={() => void applyFilters()} disabled={loadingRows}>
              {loadingRows ? t('admin.pages.translations.loading') : t('admin.pages.translations.apply_filters')}
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={() => {
                setFilters({ entityType: '', entityId: '', locale: '', field: '' });
                setPage(1);
                void loadRows(1);
              }}
              disabled={loadingRows}
            >
              {t('admin.pages.translations.reset')}
            </button>
            {filterSummary && <span className="admin-muted">{filterSummary}</span>}
          </div>
        </div>

        <div className="admin-card admin-premium-card">
          <h2 className="admin-card-title">
            {editingId ? t('admin.pages.translations.edit_translation') : t('admin.pages.translations.new_translation')}
          </h2>
          <p className="admin-muted admin-premium-card-subtitle">{t('admin.pages.translations.editor_subtitle')}</p>
          <div className="admin-premium-form-grid">
            <div>
              <label className="admin-label">{t('admin.pages.translations.entity_type')}</label>
              <select
                className="admin-input"
                value={editor.entityType}
                onChange={(event) => {
                  const nextType = (event.target.value as TranslatableEntityType) || 'INGREDIENT';
                  const nextField = configByType.get(nextType)?.fields?.[0] || 'name';
                  setEditor((prev) => ({ ...prev, entityType: nextType, field: nextField }));
                }}
              >
                {ENTITY_TYPE_OPTIONS.map((entityType) => (
                  <option key={entityType} value={entityType}>
                    {entityType}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-label">{t('admin.pages.translations.entity_id')}</label>
              <input
                className="admin-input"
                placeholder={t('admin.pages.translations.entity_id_placeholder')}
                value={editor.entityId}
                onChange={(event) => setEditor((prev) => ({ ...prev, entityId: event.target.value }))}
              />
            </div>
            <div>
              <label className="admin-label">{t('admin.pages.translations.locale')}</label>
              <input
                className="admin-input"
                placeholder="fr-fr"
                value={editor.locale}
                onChange={(event) => setEditor((prev) => ({ ...prev, locale: event.target.value }))}
              />
            </div>
            <div>
              <label className="admin-label">{t('admin.pages.translations.field')}</label>
              <select
                className="admin-input"
                value={editor.field}
                onChange={(event) => setEditor((prev) => ({ ...prev, field: event.target.value }))}
              >
                {editorFieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-label">{t('admin.pages.translations.value_type')}</label>
              <select
                className="admin-input"
                value={editor.valueKind}
                onChange={(event) =>
                  setEditor((prev) => ({ ...prev, valueKind: (event.target.value as EditorValueKind) || 'text' }))
                }
              >
                <option value="text">{t('admin.pages.translations.value_type_text')}</option>
                <option value="nullable_text">{t('admin.pages.translations.value_type_nullable_text')}</option>
                <option value="array">{t('admin.pages.translations.value_type_array')}</option>
                <option value="json">{t('admin.pages.translations.value_type_json')}</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="admin-label">{t('admin.pages.translations.value')}</label>
              <textarea
                className="admin-input"
                rows={editor.valueKind === 'json' ? 8 : 4}
                value={editor.valueInput}
                onChange={(event) => setEditor((prev) => ({ ...prev, valueInput: event.target.value }))}
                placeholder={t('admin.pages.translations.value_placeholder')}
                style={{ fontFamily: editor.valueKind === 'json' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}
              />
            </div>
          </div>
          <div className="admin-premium-actions">
            <button className="admin-btn admin-btn-primary" onClick={() => void saveTranslation()} disabled={saving}>
              {saving ? t('admin.pages.translations.saving') : t('admin.pages.translations.save_translation')}
            </button>
            <button className="admin-btn admin-btn-secondary" onClick={resetEditor} disabled={saving}>
              {t('admin.pages.translations.reset_editor')}
            </button>
            <span className="admin-muted">{t('admin.pages.translations.editor_hint')}</span>
          </div>
        </div>

        <div className="admin-card">
          <h2 className="admin-card-title">{t('admin.pages.translations.existing_translations')}</h2>
          <div className="admin-table-wrapper" style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.pages.translations.entity')}</th>
                  <th>{t('admin.pages.translations.field')}</th>
                  <th>{t('admin.pages.translations.locale')}</th>
                  <th>{t('admin.pages.translations.value')}</th>
                  <th>{t('admin.pages.translations.updated_at')}</th>
                  <th>{t('admin.pages.translations.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={editingId === row.id ? { background: 'rgba(201, 169, 98, 0.12)' } : undefined}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.entityType}</div>
                      <div className="admin-muted" style={{ fontSize: '0.8rem' }}>
                        {row.entityId}
                      </div>
                    </td>
                    <td>{row.field}</td>
                    <td>{row.locale}</td>
                    <td style={{ maxWidth: 360 }}>
                      <code>{toValuePreview(row.value)}</code>
                    </td>
                    <td>{formatDateTime(row.updatedAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-icon-button admin-btn-secondary"
                          onClick={() => startEdit(row)}
                          title={t('admin.pages.translations.edit')}
                          aria-label={t('admin.pages.translations.edit')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M3 21h6m10.5-10.5L9 21l-4 1 1-4L16.5 7.5l3 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="admin-icon-button admin-icon-button-danger"
                          onClick={() => void removeTranslation(row)}
                          title={t('admin.pages.translations.delete')}
                          aria-label={t('admin.pages.translations.delete')}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? (
                            '...'
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M4 7h16M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loadingRows && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="admin-muted" style={{ textAlign: 'center' }}>
                      {t('admin.pages.translations.no_translation_found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '0.75rem' }}>
            <button
              className="admin-btn admin-btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('admin.pages.translations.prev')}
            </button>
            <div className="admin-muted">
              {t('admin.pages.translations.page')} {page} / {totalPages}
            </div>
            <button
              className="admin-btn admin-btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {t('admin.pages.translations.next')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
