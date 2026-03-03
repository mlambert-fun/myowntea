import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { showToast } from '../lib/toast';

type IngredientOption = {
  id: string;
  name: string;
  category?: string;
};

type OrderOption = {
  id: string;
  orderNumber?: string;
};

type BlendIngredientRef = {
  ingredientId?: string;
  ingredient?: {
    id?: string;
    name?: string;
    category?: string;
  };
};

type BlendData = {
  id: string;
  name?: string;
  description?: string | null;
  color?: string;
  coverImageUrl?: string | null;
  ingredients?: BlendIngredientRef[];
};

type BlendListing = {
  id: string;
  blendId: string;
  createdFromOrderId?: string | null;
  createdBy?: string | null;
  ranking: number;
  title: string;
  slug: string;
  description?: string | null;
  coverImageUrl?: string | null;
  isActive: boolean;
  blend?: BlendData | null;
  createdFromOrder?: {
    id: string;
    orderNumber?: string;
  } | null;
};

type ListingDraft = {
  ranking: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string;
  isActive: boolean;
  createdFromOrderId: string;
  createdBy: string;
  blendName: string;
  blendDescription: string;
  blendColor: string;
  blendCoverImageUrl: string;
  ingredientIds: string[];
};

type EditorValidationErrors = Partial<Record<'title' | 'blendName' | 'ingredientIds', string>>;

const CSV_HEADERS = [
  'ranking',
  'title',
  'slug',
  'description',
  'coverImageUrl',
  'isActive',
  'createdFromOrderId',
  'createdBy',
  'blendName',
  'blendDescription',
  'blendColor',
  'blendCoverImageUrl',
  'ingredientIds',
] as const;

const toDraft = (listing?: BlendListing | null): ListingDraft => {
  const ingredientIds = Array.from(
    new Set(
      (listing?.blend?.ingredients || [])
        .map((entry) => entry.ingredientId || entry.ingredient?.id)
        .filter((id): id is string => Boolean(id))
    )
  );

  return {
    ranking: listing?.ranking ?? 0,
    title: listing?.title || '',
    slug: listing?.slug || '',
    description: listing?.description || '',
    coverImageUrl: listing?.coverImageUrl || '',
    isActive: listing?.isActive ?? false,
    createdFromOrderId: listing?.createdFromOrderId || '',
    createdBy: listing?.createdBy || '',
    blendName: listing?.blend?.name || '',
    blendDescription: listing?.blend?.description || '',
    blendColor: listing?.blend?.color || '#C4A77D',
    blendCoverImageUrl: listing?.blend?.coverImageUrl || '',
    ingredientIds,
  };
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const truncateDescription = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return `${text.slice(0, 45)}...`;
};

const csvEscape = (value: string) => {
  const normalized = String(value ?? '');
  if (!/[",\n\r]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
};

const toCsvLine = (values: string[]) => values.map(csvEscape).join(',');

const parseCsv = (content: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
};

const parseBoolean = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return ['true', '1', 'yes', 'oui', 'y'].includes(normalized);
};

const parseIngredientIds = (value: string) =>
  value
    .split('|')
    .map((id) => id.trim())
    .filter(Boolean);

export default function BlendListings() {
  const token = localStorage.getItem('adminToken') || '';
  const [listings, setListings] = useState<BlendListing[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<ListingDraft | null>(null);
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvImportSummary, setCsvImportSummary] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorValidationErrors, setEditorValidationErrors] = useState<EditorValidationErrors>({});

  const ingredientOptions = useMemo(
    () => ingredients.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [ingredients]
  );
  const nextCreateRanking = useMemo(
    () =>
      listings.reduce((maxRanking, listing) => {
        const ranking = Math.max(0, Math.round(Number(listing.ranking) || 0));
        return Math.max(maxRanking, ranking);
      }, 0) + 1,
    [listings]
  );

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [listingData, ingredientData, orderData] = await Promise.all([
        api.getAdminBlendListings(),
        api.getIngredients(),
        api.getOrders(token),
      ]);

      setListings(Array.isArray(listingData) ? listingData : []);
      setIngredients(
        Array.isArray(ingredientData)
          ? ingredientData
              .filter((ing: any) => typeof ing?.id === 'string' && typeof ing?.name === 'string')
              .map((ing: any) => ({ id: ing.id, name: ing.name, category: ing.category }))
          : []
      );
      setOrders(
        Array.isArray(orderData)
          ? orderData
              .filter((order: any) => typeof order?.id === 'string')
              .map((order: any) => ({ id: order.id, orderNumber: order.orderNumber }))
          : []
      );
    } catch (error) {
      console.error('Failed to load blend listings admin data', error);
    } finally {
      setLoading(false);
    }
  }

  const updateCreateDraft = (updater: (draft: ListingDraft) => ListingDraft) => {
    setCreateDraft((prev) => (prev ? updater(prev) : prev));
  };

  const closeEditor = () => {
    setEditingId(null);
    setCreateDraft(null);
    setCreateSlugTouched(false);
    setEditorError(null);
    setEditorValidationErrors({});
  };

  const openCreateForm = () => {
    setEditingId(null);
    setCreateSlugTouched(false);
    setCreateDraft({ ...toDraft(null), ranking: nextCreateRanking });
    setEditorError(null);
    setEditorValidationErrors({});
  };

  const openEditForm = (listing: BlendListing) => {
    setEditingId(listing.id);
    setCreateSlugTouched(false);
    setCreateDraft(toDraft(listing));
    setEditorError(null);
    setEditorValidationErrors({});
  };

  const buildListingPayload = (draft: ListingDraft) => ({
    ranking: Math.max(0, Math.round(Number(draft.ranking) || 0)),
    title: draft.title.trim(),
    slug: draft.slug.trim() || undefined,
    description: draft.description.trim() || null,
    coverImageUrl: draft.coverImageUrl.trim() || null,
    isActive: draft.isActive,
    createdFromOrderId: draft.createdFromOrderId.trim() || null,
    createdBy: draft.createdBy.trim() || null,
    blend: {
      name: draft.blendName.trim(),
      description: draft.blendDescription.trim() || null,
      color: draft.blendColor.trim() || '#C4A77D',
      coverImageUrl: draft.blendCoverImageUrl.trim() || null,
      ingredientIds: draft.ingredientIds,
    },
  });

  const validateDraft = (draft: ListingDraft) => {
    const validationErrors: EditorValidationErrors = {};
    if (!draft.title.trim()) {
      validationErrors.title = 'Le titre de la création est obligatoire.';
    }
    if (!draft.blendName.trim()) {
      validationErrors.blendName = 'Le nom du blend est obligatoire.';
    }
    if (!draft.ingredientIds.length) {
      validationErrors.ingredientIds = 'Ajoutez au moins un ingrédient au blend.';
    }

    setEditorValidationErrors(validationErrors);
    const firstError = Object.values(validationErrors)[0];
    if (firstError) {
      setEditorError(firstError);
      showToast(firstError, 'error');
      return false;
    }

    setEditorError(null);
    return true;
  };

  async function saveEditedListing() {
    if (!createDraft || !editingId) return;
    if (!validateDraft(createDraft)) return;

    try {
      setSavingId(editingId);
      await api.updateBlendListing(editingId, buildListingPayload(createDraft), token);
      closeEditor();
      await loadData();
    } catch (error) {
      console.error('Failed to save listing', error);
      const message = "Impossible d'enregistrer cette creation.";
      setEditorError(message);
      showToast(message, 'error');
    } finally {
      setSavingId(null);
    }
  }

  async function createListing() {
    if (!createDraft) return;
    if (!validateDraft(createDraft)) return;

    try {
      setSavingId('create');
      await api.createBlendListing(buildListingPayload(createDraft), token);
      closeEditor();
      await loadData();
    } catch (error) {
      console.error('Failed to create listing', error);
      const message = 'Impossible de créer ce blend/listing.';
      setEditorError(message);
      showToast(message, 'error');
    } finally {
      setSavingId(null);
    }
  }

  async function deleteListing(listing: BlendListing) {
    const label = listing.title?.trim() || 'ce blend';
    if (!window.confirm(`Supprimer "${label}" ?`)) return;

    try {
      setSavingId(listing.id);
      await api.deleteBlendListing(listing.id, token);
      if (editingId === listing.id) {
        closeEditor();
      }
      await loadData();
    } catch (error) {
      console.error('Failed to delete listing', error);
      const message = 'Impossible de supprimer cette création.';
      setEditorError(message);
      showToast(message, 'error');
    } finally {
      setSavingId(null);
    }
  }

  const downloadCsv = (filename: string, rows: string[][]) => {
    const csvContent = rows.map((row) => toCsvLine(row)).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const getListingIngredientIds = (listing: BlendListing) =>
    Array.from(
      new Set(
        (listing.blend?.ingredients || [])
          .map((entry) => entry.ingredientId || entry.ingredient?.id)
          .filter((id): id is string => Boolean(id))
      )
    );

  const downloadTemplateCsv = () => {
    downloadCsv('blend_listings_template.csv', [Array.from(CSV_HEADERS)]);
  };

  const exportListingsCsv = () => {
    const rows: string[][] = [
      Array.from(CSV_HEADERS),
      ...listings.map((listing) => [
        String(Math.max(0, Math.round(Number(listing.ranking) || 0))),
        listing.title || '',
        listing.slug || '',
        listing.description || '',
        listing.coverImageUrl || '',
        listing.isActive ? 'true' : 'false',
        listing.createdFromOrderId || '',
        listing.createdBy || '',
        listing.blend?.name || '',
        listing.blend?.description || '',
        listing.blend?.color || '#C4A77D',
        listing.blend?.coverImageUrl || '',
        getListingIngredientIds(listing).join('|'),
      ]),
    ];

    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`blend_listings_export_${date}.csv`, rows);
  };

  const closeCsvModal = () => {
    if (importingCsv) return;
    setShowCsvModal(false);
    setCsvFile(null);
    setCsvImportError(null);
    setCsvImportSummary(null);
  };

  async function importCsvFile() {
    if (!csvFile) {
      setCsvImportError('Sélectionnez un fichier CSV.');
      setCsvImportSummary(null);
      return;
    }

    try {
      setImportingCsv(true);
      setCsvImportError(null);
      setCsvImportSummary(null);

      const content = await csvFile.text();
      const rows = parseCsv(content).filter((row) => row.some((cell) => cell.trim().length > 0));
      if (rows.length === 0) {
        setCsvImportError('Le fichier CSV est vide.');
        return;
      }

      const rawHeaders = rows[0].map((cell, index) => {
        const sanitized = index === 0 ? cell.replace(/^\uFEFF/, '') : cell;
        return sanitized.trim();
      });
      const headerIndex = rawHeaders.reduce<Record<string, number>>((acc, header, index) => {
        acc[header] = index;
        return acc;
      }, {});

      const missingHeaders = CSV_HEADERS.filter((header) => headerIndex[header] === undefined);
      if (missingHeaders.length > 0) {
        setCsvImportError(`Headers manquants: ${missingHeaders.join(', ')}`);
        return;
      }

      let successCount = 0;
      const failures: string[] = [];

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        const lineNumber = rowIndex + 1;
        const getCell = (header: (typeof CSV_HEADERS)[number]) =>
          String(row[headerIndex[header]] ?? '').trim();

        const rankingRaw = getCell('ranking');
        const ranking = Math.max(0, Math.round(Number(rankingRaw || 0) || 0));
        const draft: ListingDraft = {
          ranking,
          title: getCell('title'),
          slug: getCell('slug'),
          description: getCell('description'),
          coverImageUrl: getCell('coverImageUrl'),
          isActive: parseBoolean(getCell('isActive')),
          createdFromOrderId: getCell('createdFromOrderId'),
          createdBy: getCell('createdBy'),
          blendName: getCell('blendName'),
          blendDescription: getCell('blendDescription'),
          blendColor: getCell('blendColor') || '#C4A77D',
          blendCoverImageUrl: getCell('blendCoverImageUrl'),
          ingredientIds: parseIngredientIds(getCell('ingredientIds')),
        };

        if (!draft.title || !draft.blendName || draft.ingredientIds.length === 0) {
          failures.push(
            `Ligne ${lineNumber}: titre, nom du blend et ingredientIds sont obligatoires.`
          );
          continue;
        }

        try {
          const response = await api.createBlendListing(buildListingPayload(draft), token);
          if (response?.error) {
            throw new Error(String(response.error));
          }
          successCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erreur inconnue';
          failures.push(`Ligne ${lineNumber}: ${message}`);
        }
      }

      if (successCount > 0) {
        await loadData();
      }

      if (failures.length === 0) {
        setCsvImportSummary(`${successCount} blend(s) importé(s) avec succès.`);
      } else {
        const preview = failures.slice(0, 5).join('\n');
        const hiddenCount = Math.max(0, failures.length - 5);
        const suffix = hiddenCount > 0 ? `\n... ${hiddenCount} erreur(s) supplémentaire(s).` : '';
        setCsvImportSummary(
          `${successCount} blend(s) importé(s), ${failures.length} erreur(s).\n${preview}${suffix}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur CSV inconnue';
      setCsvImportError(message);
    } finally {
      setImportingCsv(false);
    }
  }

  const renderIngredientSelect = (
    value: string[],
    onChange: (next: string[]) => void
  ) => (
    <select
      multiple
      className="admin-input"
      value={value}
      onChange={(e) => {
        const selected = Array.from(e.target.selectedOptions, (option) => option.value);
        onChange(selected);
      }}
      style={{ minWidth: 240, height: 96 }}
    >
      {ingredientOptions.map((ing) => (
        <option key={ing.id} value={ing.id}>
          {ing.name} ({ing.category || '-'})
        </option>
      ))}
    </select>
  );

  return (
    <Layout>
      <div className="admin-page admin-page-premium-lite">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2>Créations (Blend Listings)</h2>
            <p className="admin-muted">Créez et éditez vos blends manuellement, puis publiez-les via les listings.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="admin-btn admin-btn-secondary"
              onClick={() => {
                setShowCsvModal(true);
                setCsvImportError(null);
                setCsvImportSummary(null);
              }}
              type="button"
            >
              Import/Export CSV
            </button>
            {!createDraft && (
              <button
                className="admin-btn admin-btn-primary"
                onClick={openCreateForm}
              >
                Nouveau blend
              </button>
            )}
          </div>
        </div>

        {editorError && (
          <div className="admin-alert admin-alert-error" role="alert">
            {editorError}
          </div>
        )}

        {createDraft && (
          <div className="admin-card" style={{ marginBottom: '1rem' }}>
            <h3 className="admin-card-title" style={{ marginBottom: '1rem' }}>
              {editingId ? 'Modifier blend/listing' : 'Nouveau blend/listing'}
            </h3>
            <div className="admin-grid-2">
              <div>
                <label className="admin-label">Ranking</label>
                <input
                  className="admin-input"
                  type="number"
                  min={0}
                  value={createDraft.ranking}
                  onChange={(e) =>
                    updateCreateDraft((d) => ({
                      ...d,
                      ranking: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    }))
                  }
                />
              </div>
              <div>
                <label className="admin-label">Titre listing</label>
                <input
                  className="admin-input"
                  value={createDraft.title}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    setEditorValidationErrors((prev) => ({ ...prev, title: undefined }));
                    setEditorError(null);
                    updateCreateDraft((d) => ({
                      ...d,
                      title: nextTitle,
                      slug: createSlugTouched ? d.slug : slugify(nextTitle),
                    }));
                  }}
                />
                {editorValidationErrors.title && <p className="admin-error">{editorValidationErrors.title}</p>}
              </div>
              <div>
                <label className="admin-label">Slug (optionnel)</label>
                <input
                  className="admin-input"
                  value={createDraft.slug}
                  onChange={(e) => {
                    setCreateSlugTouched(true);
                    const nextSlug = slugify(e.target.value);
                    updateCreateDraft((d) => ({ ...d, slug: nextSlug }));
                  }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">Description listing</label>
                <textarea
                  className="admin-input"
                  rows={3}
                  value={createDraft.description}
                  onChange={(e) => updateCreateDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Description courte de la création"
                />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.75rem', alignItems: 'end' }}>
                <div>
                  <label className="admin-label">Commande source (createdFromOrderId)</label>
                  <select className="admin-input" value={createDraft.createdFromOrderId} onChange={(e) => updateCreateDraft((d) => ({ ...d, createdFromOrderId: e.target.value }))}>
                    <option value="">Aucune</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>{order.orderNumber || order.id}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-muted" style={{ paddingBottom: '0.5rem' }}>ou</div>
                <div>
                  <label className="admin-label">Créé par (createdBy)</label>
                  <input className="admin-input" value={createDraft.createdBy} onChange={(e) => updateCreateDraft((d) => ({ ...d, createdBy: e.target.value }))} placeholder="Nom libre (optionnel)" />
                </div>
              </div>
              <div>
                <label className="admin-label">Nom blend</label>
                <input
                  className="admin-input"
                  value={createDraft.blendName}
                  onChange={(e) => {
                    setEditorValidationErrors((prev) => ({ ...prev, blendName: undefined }));
                    setEditorError(null);
                    updateCreateDraft((d) => ({ ...d, blendName: e.target.value }));
                  }}
                />
                {editorValidationErrors.blendName && <p className="admin-error">{editorValidationErrors.blendName}</p>}
              </div>
              <div>
                <label className="admin-label">Couleur blend</label>
                <input className="admin-input" value={createDraft.blendColor} onChange={(e) => updateCreateDraft((d) => ({ ...d, blendColor: e.target.value }))} />
              </div>
              <div>
                <label className="admin-label">Cover blend URL</label>
                <input className="admin-input" value={createDraft.blendCoverImageUrl} onChange={(e) => updateCreateDraft((d) => ({ ...d, blendCoverImageUrl: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">Ingredient IDs</label>
                {renderIngredientSelect(createDraft.ingredientIds, (next) => {
                  setEditorValidationErrors((prev) => ({ ...prev, ingredientIds: undefined }));
                  setEditorError(null);
                  updateCreateDraft((d) => ({ ...d, ingredientIds: next }));
                })}
                {editorValidationErrors.ingredientIds && <p className="admin-error">{editorValidationErrors.ingredientIds}</p>}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">Actif</label>
                <input type="checkbox" checked={createDraft.isActive} onChange={(e) => updateCreateDraft((d) => ({ ...d, isActive: e.target.checked }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={closeEditor}
              >
                Annuler
              </button>
              <button
                type="button"
                className="admin-icon-button admin-btn-secondary"
                aria-label="Enregistrer"
                title="Enregistrer"
                onClick={editingId ? saveEditedListing : createListing}
                disabled={Boolean(savingId)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M17 21v-8H7v8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 3v5h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p>Chargement...</p>
        ) : listings.length === 0 ? (
          <p>Aucune création disponible.</p>
        ) : (
          <div className="admin-card">
            <div className="admin-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>Ranking</th>
                    <th>Blend</th>
                    <th>Cover blend</th>
                    <th>Ingredients</th>
                    <th>Commande</th>
                    <th>Actif</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => (
                    <tr key={listing.id}>
                      <td>
                        <div>
                          <div><strong>{listing.title}</strong></div>
                          <div className="admin-muted">/{listing.slug}</div>
                          {listing.description && <div className="admin-muted">{truncateDescription(listing.description)}</div>}
                        </div>
                      </td>
                      <td>
                        <span>{listing.ranking ?? 0}</span>
                      </td>
                      <td>
                        <div>
                          <div><strong>{listing.blend?.name || '-'}</strong></div>
                          <div className="admin-muted">{listing.blend?.color || '-'}</div>
                        </div>
                      </td>
                      <td>
                        <span className="admin-muted">{listing.blend?.coverImageUrl || '-'}</span>
                      </td>
                      <td>
                        <span>{(listing.blend?.ingredients || []).length} ingredient(s)</span>
                      </td>
                      <td>
                        <span>{(listing.createdBy || '').trim() || listing.createdFromOrder?.orderNumber || '-'}</span>
                      </td>
                      <td>
                        <span>{listing.isActive ? 'Oui' : 'Non'}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="admin-icon-button admin-btn-secondary"
                            onClick={() => {
                              if (editingId === listing.id && createDraft) {
                                closeEditor();
                              } else {
                                openEditForm(listing);
                              }
                            }}
                            disabled={Boolean(savingId)}
                            aria-label={editingId === listing.id ? 'Annuler la modification' : 'Modifier'}
                            title={editingId === listing.id ? 'Annuler la modification' : 'Modifier'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M12 20h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="admin-icon-button admin-icon-button-danger"
                            onClick={() => void deleteListing(listing)}
                            disabled={Boolean(savingId)}
                            aria-label="Supprimer"
                            title="Supprimer"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M3 6h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M10 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M14 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showCsvModal && (
          <div className="admin-modal-backdrop" onClick={closeCsvModal}>
            <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
              <h3 className="admin-card-title" style={{ marginBottom: '1rem' }}>Import / Export CSV</h3>
              <p className="admin-muted" style={{ marginBottom: '1rem' }}>
                Le template et l'import utilisent les mêmes colonnes.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={downloadTemplateCsv}>
                  Télécharger template CSV
                </button>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={exportListingsCsv}>
                  Exporter les blends
                </button>
              </div>

              <div className="admin-card" style={{ padding: '1rem' }}>
                <label className="admin-label" style={{ marginBottom: '0.5rem' }}>Importer un CSV</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="admin-input"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0] || null;
                    setCsvFile(nextFile);
                    setCsvImportError(null);
                    setCsvImportSummary(null);
                  }}
                />
                {csvFile && (
                  <p className="admin-muted" style={{ marginTop: '0.5rem' }}>
                    Fichier sélectionné: {csvFile.name}
                  </p>
                )}
                {csvImportError && (
                  <div className="admin-alert" style={{ marginTop: '0.75rem' }}>
                    {csvImportError}
                  </div>
                )}
                {csvImportSummary && (
                  <div className="admin-alert" style={{ marginTop: '0.75rem', whiteSpace: 'pre-line' }}>
                    {csvImportSummary}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={closeCsvModal}>
                  Fermer
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => void importCsvFile()}
                  disabled={!csvFile || importingCsv}
                >
                  {importingCsv ? 'Import en cours...' : 'Importer le CSV'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
