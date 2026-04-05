import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
interface Ingredient {
    id: string;
    name: string;
    category: string;
    basePrice: number;
    stock: number;
    description: string;
    longDescription?: string | null;
    image: string;
    color: string;
    intensity: number;
    umami: number;
    sweetness: number;
    thickness: number;
    finish: number;
    benefits: string[];
    flavor?: string | null;
    flavors?: string[]; // Ajouté pour la gestion des saveurs multiples
    dayMoments?: string[] | null;
    infusionTime?: string | null;
    dosage?: string | null;
    temperature?: string | null;
    preparation?: string | null;
    origin?: string | null;
    pairing?: string | null;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
}
const BENEFITS_OPTIONS = [
    'Relaxation / anti-stress',
    'Sommeil',
    t("admin.pages.ingredients.bon_circulation_sanguine"),
    'Digestion',
    t("admin.pages.ingredients.diuretique_light"),
    t("admin.pages.ingredients.energie"),
    'Concentration',
    t("admin.pages.ingredients.immunite"),
    'Respiratoire / gorge',
    'Antioxydant',
    'Anti-inflammatoire',
    t("admin.pages.ingredients.sante_peau"),
    t("admin.pages.ingredients.sante_yeux"),
    t("admin.pages.ingredients.soutien_tension_arterielle"),
    t("admin.pages.ingredients.source_vitamine"),
    t("admin.pages.ingredients.source_fibres"),
    t("admin.pages.ingredients.source_fer"),
    t("admin.pages.ingredients.source_omega"),
];
const FLAVOR_OPTIONS = [
    'Doux',
    'Floral',
    t("admin.pages.ingredients.light"),
    t("admin.pages.ingredients.tangy"),
    t("admin.pages.ingredients.fruite"),
    t("admin.pages.ingredients.sucre"),
    t("admin.pages.ingredients.delicat"),
    'Exotique',
    t("admin.pages.ingredients.refreshing"),
    t("admin.pages.ingredients.citrus"),
    'Riche',
    'Energisant',
    t("admin.pages.ingredients.menthole"),
    t("admin.pages.ingredients.herbace"),
    'Terreux',
    t("admin.pages.ingredients.anise"),
    t("admin.pages.ingredients.spicy"),
    'Piquant',
    'Frais',
    t("admin.pages.ingredients.legerement_amere"),
    t("admin.pages.ingredients.amere"),
    'Noisette',
    t("admin.pages.ingredients.herbal"),
    t("admin.pages.ingredients.legerement_acide"),
    'Acide',
    t("admin.pages.ingredients.legerement_spicy"),
];
const DAY_MOMENT_OPTIONS = ['Matin', t("admin.pages.ingredients.apres_midi"), 'Soir', t("admin.pages.ingredients.toute_daytime")];
const BENEFITS_OPTIONS_SORTED = [...BENEFITS_OPTIONS].sort((a, b) => a.localeCompare(b, 'fr'));
const FLAVOR_OPTIONS_SORTED = [...FLAVOR_OPTIONS].sort((a, b) => a.localeCompare(b, 'fr'));
type ColumnId = 'name' | 'category' | 'basePrice' | 'description' | 'color' | 'benefits' | 'isActive' | 'createdAt' | 'updatedAt';
interface Column {
    id: ColumnId;
    label: string;
    visible: boolean;
}
const MAX_IMAGE_DIMENSION = 1200;
const IMAGE_QUALITY = 0.75;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const validateImageFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return t("admin.pages.ingredients.format_non_supported");
    }
    if (file.size > MAX_IMAGE_BYTES) {
        return 'Image trop lourde (max 5 Mo).';
    }
    return null;
};
async function optimizeImage(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Image export failed'))), 'image/webp', IMAGE_QUALITY);
    });
    return blob;
}
export default function Ingredients() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortColumn, setSortColumn] = useState<ColumnId>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [imagePreview, setImagePreview] = useState<string>('');
    const [imageError, setImageError] = useState<string | null>(null);
    const [showColumnChips, setShowColumnChips] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [filters, setFilters] = useState({
        category: '',
        status: '',
        intensity: '',
        minPrice: '',
        maxPrice: '',
        minStock: '',
        maxStock: '',
    });
    const [columns, setColumns] = useState<Column[]>([
        { id: 'name', label: 'Nom', visible: true },
        { id: 'category', label: t("admin.pages.ingredients.category"), visible: true },
        { id: 'basePrice', label: 'Prix', visible: true },
        { id: 'description', label: 'Description', visible: false },
        { id: 'color', label: 'Couleur', visible: true },
        { id: 'benefits', label: 'Bienfaits', visible: false },
        { id: 'isActive', label: 'Actif', visible: true },
        { id: 'createdAt', label: t("admin.pages.ingredients.created_at"), visible: false },
        { id: 'updatedAt', label: t("admin.pages.ingredients.updated"), visible: false },
    ]);
    const [formData, setFormData] = useState({
        name: '',
        category: 'base',
        basePrice: '',
        stock: '',
        description: '',
        longDescription: '',
        image: '',
        color: '#7C9A6B',
        intensity: 3,
        umami: 3,
        sweetness: 3,
        thickness: 3,
        finish: 3,
        benefits: [] as string[],
        flavor: '',
        pairing: '',
        flavors: [] as string[],
        dayMoments: [] as string[],
        infusionTime: '',
        dosage: '',
        temperature: '',
        preparation: '',
        origin: '',
        isActive: true,
    });
    const inputClass = 'admin-input';
    const labelClass = 'admin-label';
    useEffect(() => {
        loadIngredients();
    }, []);
    async function loadIngredients() {
        try {
            const data = await api.getIngredients();
            setIngredients(data);
        }
        catch (error) {
            console.error('Failed to load ingredients', error);
        }
    }
    const filteredIngredients = ingredients
        .filter(ing => ing.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter((ing) => {
        if (filters.category && ing.category !== filters.category)
            return false;
        if (filters.status === 'active' && !ing.isActive)
            return false;
        if (filters.status === 'inactive' && ing.isActive)
            return false;
        if (filters.intensity && ing.intensity !== Number(filters.intensity))
            return false;
        const minPrice = filters.minPrice ? Number(filters.minPrice) : null;
        const maxPrice = filters.maxPrice ? Number(filters.maxPrice) : null;
        const minStock = filters.minStock ? Number(filters.minStock) : null;
        const maxStock = filters.maxStock ? Number(filters.maxStock) : null;
        if (minPrice !== null && ing.basePrice < minPrice)
            return false;
        if (maxPrice !== null && ing.basePrice > maxPrice)
            return false;
        if (minStock !== null && ing.stock < minStock)
            return false;
        if (maxStock !== null && ing.stock > maxStock)
            return false;
        return true;
    })
        .sort((a, b) => {
        const aVal = a[sortColumn] ?? '';
        const bVal = b[sortColumn] ?? '';
        const modifier = sortDirection === 'asc' ? 1 : -1;
        if (aVal < bVal)
            return -1 * modifier;
        if (aVal > bVal)
            return 1 * modifier;
        return 0;
    });
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filters, sortColumn, sortDirection, pageSize]);
    const totalItems = filteredIngredients.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);
    const pageStartIndex = (currentPage - 1) * pageSize;
    const paginatedIngredients = filteredIngredients.slice(pageStartIndex, pageStartIndex + pageSize);
    const handleSort = (columnId: ColumnId) => {
        if (sortColumn === columnId) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        }
        else {
            setSortColumn(columnId);
            setSortDirection('asc');
        }
    };
    const toggleColumnVisibility = (columnId: ColumnId) => {
        setColumns(cols => cols.map(col => col.id === columnId ? { ...col, visible: !col.visible } : col));
    };
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        const validation = validateImageFile(file);
        if (validation) {
            setImageError(validation);
            return;
        }
        setImageError(null);
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);
        const folder = `ingredients/${formData.category || 'misc'}`;
        try {
            const optimizedBlob = await optimizeImage(file);
            const optimizedFile = new File([optimizedBlob], file.name.replace(/\.[^/.]+$/, '.webp'), {
                type: 'image/webp',
            });
            const response = await api.uploadImage(optimizedFile, folder);
            setImagePreview(response.url);
            setFormData({ ...formData, image: response.url });
        }
        catch (error) {
            console.error('Image optimization failed', error);
            try {
                const response = await api.uploadImage(file, folder);
                setImagePreview(response.url);
                setFormData({ ...formData, image: response.url });
            }
            catch (uploadError) {
                console.error('Image upload failed', uploadError);
                setImageError(t("admin.pages.ingredients.upload_failed_reessayez"));
            }
        }
        finally {
            URL.revokeObjectURL(previewUrl);
        }
    };
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            const trimmedOrNull = (value: string) => value.trim() ? value.trim() : null;
            const baseFields = formData.category === 'base'
                ? {
                    dayMoments: formData.dayMoments.length ? formData.dayMoments : null,
                    infusionTime: trimmedOrNull(formData.infusionTime),
                    dosage: trimmedOrNull(formData.dosage),
                    temperature: trimmedOrNull(formData.temperature),
                    preparation: trimmedOrNull(formData.preparation),
                    origin: trimmedOrNull(formData.origin),
                }
                : {
                    dayMoments: null,
                    infusionTime: null,
                    dosage: null,
                    temperature: null,
                    preparation: null,
                    origin: null,
                };
            const payload = {
                ...formData,
                basePrice: parseFloat(formData.basePrice),
                stock: parseInt(formData.stock),
                ...baseFields,
                longDescription: formData.longDescription || null,
                flavor: trimmedOrNull(formData.flavor),
                pairing: trimmedOrNull(formData.pairing),
                flavors: formData.flavors || [],
            };
            if (editingId) {
                await api.updateIngredient(editingId, payload);
            }
            else {
                await api.createIngredient(payload);
            }
            setShowModal(false);
            setEditingId(null);
            resetForm();
            loadIngredients();
        }
        catch (error) {
            console.error('Failed to save ingredient', error);
        }
    }
    function resetForm() {
        setFormData({
            name: '',
            category: 'base',
            basePrice: '',
            stock: '',
            description: '',
            longDescription: '',
            image: '',
            color: '#7C9A6B',
            intensity: 3,
            umami: 3,
            sweetness: 3,
            thickness: 3,
            finish: 3,
            benefits: [],
            flavor: '',
            pairing: '',
            flavors: [],
            dayMoments: [],
            infusionTime: '',
            dosage: '',
            temperature: '',
            preparation: '',
            origin: '',
            isActive: true,
        });
        setImagePreview('');
        setEditingId(null);
    }
    function handleDeleteRequest(ingredient: Ingredient) {
        setDeleteTarget(ingredient);
    }
    async function confirmDelete() {
        if (!deleteTarget)
            return;
        const targetId = deleteTarget.id;
        setDeleteTarget(null);
        setIngredients((prev) => prev.filter((ing) => ing.id !== targetId));
        try {
            await api.deleteIngredient(targetId);
        }
        catch (error) {
            console.error('Failed to delete ingredient', error);
            loadIngredients();
        }
    }
    function openEditModal(ingredient: Ingredient) {
        setEditingId(ingredient.id);
        setFormData({
            name: ingredient.name,
            category: ingredient.category,
            basePrice: ingredient.basePrice.toString(),
            stock: ingredient.stock.toString(),
            description: ingredient.description || '',
            longDescription: ingredient.longDescription || '',
            image: ingredient.image || '',
            color: ingredient.color || '#7C9A6B',
            intensity: ingredient.intensity || 3,
            umami: ingredient.umami || 3,
            sweetness: ingredient.sweetness || 3,
            thickness: ingredient.thickness || 3,
            finish: ingredient.finish || 3,
            benefits: ingredient.benefits || [],
            flavor: ingredient.flavor || '',
            pairing: ingredient.pairing || '',
            flavors: Array.isArray(ingredient.flavors) ? ingredient.flavors : [],
            dayMoments: Array.isArray(ingredient.dayMoments) ? ingredient.dayMoments : [],
            infusionTime: ingredient.infusionTime || '',
            dosage: ingredient.dosage || '',
            temperature: ingredient.temperature || '',
            preparation: ingredient.preparation || '',
            origin: ingredient.origin || '',
            isActive: ingredient.isActive !== undefined ? ingredient.isActive : true,
        });
        setImagePreview(ingredient.image || '');
        setShowModal(true);
    }
    function openDuplicateModal(ingredient: Ingredient) {
        setEditingId(null);
        setFormData({
            name: ingredient.name,
            category: ingredient.category,
            basePrice: ingredient.basePrice.toString(),
            stock: ingredient.stock.toString(),
            description: ingredient.description || '',
            longDescription: ingredient.longDescription || '',
            image: ingredient.image || '',
            color: ingredient.color || '#7C9A6B',
            intensity: ingredient.intensity || 3,
            umami: ingredient.umami || 3,
            sweetness: ingredient.sweetness || 3,
            thickness: ingredient.thickness || 3,
            finish: ingredient.finish || 3,
            benefits: ingredient.benefits || [],
            flavor: ingredient.flavor || '',
            pairing: ingredient.pairing || '',
            flavors: Array.isArray(ingredient.flavors) ? ingredient.flavors : [],
            dayMoments: Array.isArray(ingredient.dayMoments) ? ingredient.dayMoments : [],
            infusionTime: ingredient.infusionTime || '',
            dosage: ingredient.dosage || '',
            temperature: ingredient.temperature || '',
            preparation: ingredient.preparation || '',
            origin: ingredient.origin || '',
            isActive: ingredient.isActive !== undefined ? ingredient.isActive : true,
        });
        setImagePreview(ingredient.image || '');
        setShowModal(true);
    }
    const renderCell = (ingredient: Ingredient, columnId: ColumnId) => {
        switch (columnId) {
            case 'name':
                return (<a href="#" className="admin-link-inline" onClick={(event) => {
                        event.preventDefault();
                        openEditModal(ingredient);
                    }}>
            {ingredient.name}
          </a>);
            case 'category':
                return ingredient.category;
            case 'basePrice':
                return `€${ingredient.basePrice?.toFixed(2) || '0.00'}`;
            case 'description':
                return ingredient.description?.substring(0, 50) + '...';
            case 'color':
                return (<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        backgroundColor: ingredient.color,
                        border: '1px solid #ddd'
                    }}/>
            <span>{ingredient.color}</span>
          </div>);
            case 'benefits':
                return ingredient.benefits?.join(', ') || '-';
            case 'isActive':
                return (<span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        backgroundColor: ingredient.isActive ? '#d4edda' : '#f8d7da',
                        color: ingredient.isActive ? '#155724' : '#721c24',
                    }}>
            {ingredient.isActive ? 'Actif' : 'Inactif'}
          </span>);
            case 'createdAt':
                return ingredient.createdAt ? new Date(ingredient.createdAt).toLocaleDateString('fr-FR') : '-';
            case 'updatedAt':
                return ingredient.updatedAt ? new Date(ingredient.updatedAt).toLocaleDateString('fr-FR') : '-';
            default:
                return '-';
        }
    };
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <h1 className="admin-title">{t("admin.pages.ingredients.ingredients")}</h1>
          <button className="admin-btn admin-btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>{t("admin.pages.ingredients.add_ingredient")}</button>
        </div>

      <div className="admin-card">
        {/* Search and Column Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <input type="text" className={inputClass} placeholder={t("admin.pages.ingredients.rechercher_ingredient")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}/>
          </div>
          <button type="button" onClick={() => setShowFilters((prev) => !prev)} className="admin-btn admin-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }} title={showFilters ? t("admin.pages.ingredients.hide_filters") : t("admin.pages.ingredients.display_filters")} aria-label={showFilters ? t("admin.pages.ingredients.hide_filters") : t("admin.pages.ingredients.display_filters")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M7 12H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10 18H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Filtres
          </button>
          <button type="button" onClick={() => setShowColumnChips((prev) => !prev)} className="admin-btn admin-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }} title={showColumnChips ? t("admin.pages.ingredients.hide_columns") : t("admin.pages.ingredients.display_columns")} aria-label={showColumnChips ? t("admin.pages.ingredients.hide_columns") : t("admin.pages.ingredients.display_columns")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 12C3.8 7.5 7.6 5 12 5C16.4 5 20.2 7.5 22 12C20.2 16.5 16.4 19 12 19C7.6 19 3.8 16.5 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            Colonnes
          </button>
          {showColumnChips && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {columns.map(col => (<button key={col.id} onClick={() => toggleColumnVisibility(col.id)} className={`admin-chip ${col.visible ? 'active' : ''}`}>
                  {col.label}
                </button>))}
            </div>)}
        </div>
        {showFilters && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
            <select className={inputClass} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} style={{ minWidth: '160px' }}>
              <option value="">{t("admin.pages.ingredients.all_categories")}</option>
              <option value="base">Bases</option>
              <option value="flower">Fleurs</option>
              <option value="fruit">Fruits</option>
              <option value="vegetal">Plantes</option>
              <option value="aroma">{t("admin.pages.ingredients.aromes_naturels")}</option>
            </select>
            <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ minWidth: '140px' }}>
              <option value="">Tous statuts</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
            <select className={inputClass} value={filters.intensity} onChange={(e) => setFilters({ ...filters, intensity: e.target.value })} style={{ minWidth: '140px' }}>
              <option value="">{t("admin.pages.ingredients.toute_intensity")}</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
            <input type="number" step="0.01" className={inputClass} placeholder="Prix min" value={filters.minPrice} onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })} style={{ width: '130px' }}/>
            <input type="number" step="0.01" className={inputClass} placeholder="Prix max" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} style={{ width: '130px' }}/>
            <input type="number" className={inputClass} placeholder="Stock min" value={filters.minStock} onChange={(e) => setFilters({ ...filters, minStock: e.target.value })} style={{ width: '130px' }}/>
            <input type="number" className={inputClass} placeholder="Stock max" value={filters.maxStock} onChange={(e) => setFilters({ ...filters, maxStock: e.target.value })} style={{ width: '130px' }}/>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setFilters({
                category: '',
                status: '',
                intensity: '',
                minPrice: '',
                maxPrice: '',
                minStock: '',
                maxStock: '',
            })}>{t("admin.pages.ingredients.reset")}</button>
          </div>)}
        
        <div className="admin-table-wrapper" style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                {columns.filter(col => col.visible).map(col => (<th key={col.id} onClick={() => handleSort(col.id)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    {col.label} {sortColumn === col.id && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>))}
                <th aria-label="Actions"/>
              </tr>
            </thead>
            <tbody>
              {paginatedIngredients.map((ingredient) => (<tr key={ingredient.id}>
                  {columns.filter(col => col.visible).map(col => (<td key={col.id}>{renderCell(ingredient, col.id)}</td>))}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button type="button" onClick={() => openDuplicateModal(ingredient)} className="admin-icon-button admin-btn-secondary" aria-label={`Dupliquer ${ingredient.name}`} title={`Dupliquer ${ingredient.name}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                      <button type="button" onClick={() => handleDeleteRequest(ingredient)} className="admin-icon-button admin-icon-button-danger" aria-label={`Supprimer ${ingredient.name}`} title={t("admin.pages.ingredients.delete")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>))}
              {paginatedIngredients.length === 0 && (<tr>
                  <td colSpan={columns.filter(col => col.visible).length + 1} style={{ textAlign: 'center', padding: '1.2rem' }}>{t("admin.pages.ingredients.none_ingredient_trouve")}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            {totalItems === 0
            ? t("admin.pages.ingredients.resultat") : `${pageStartIndex + 1}-${Math.min(pageStartIndex + pageSize, totalItems)} sur ${totalItems}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Par page</label>
            <select className={inputClass} value={pageSize} onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 20))} style={{ width: '92px', padding: '0.35rem 0.6rem' }}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage <= 1} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>{t("admin.pages.ingredients.prev")}</button>
            <span style={{ minWidth: '85px', textAlign: 'center', fontSize: '0.9rem' }}>
              {currentPage} / {totalPages}
            </span>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              Suivant
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showModal && (<div className="admin-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-card-title" style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>
              {editingId ? t("admin.pages.ingredients.edit") : t("admin.pages.ingredients.add")}{t("admin.pages.ingredients.ingredient")}</h2>
            <form onSubmit={handleSubmit}>
              <div className="admin-grid-2">
                {/* Nom */}
                <div>
                  <label className={labelClass}>Nom *</label>
                  <input type="text" className={inputClass} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required/>
                </div>

                {/* Catégorie */}
                <div>
                  <label className={labelClass}>{t("admin.pages.ingredients.category_2")}</label>
                  <select className={inputClass} value={formData.category} onChange={(e) => {
                const nextCategory = e.target.value;
                setFormData((prev) => ({
                    ...prev,
                    category: nextCategory,
                    ...(nextCategory === 'base'
                        ? {}
                        : {
                            dayMoments: [],
                            infusionTime: '',
                            dosage: '',
                            temperature: '',
                            preparation: '',
                            origin: '',
                        }),
                }));
            }}>
                    <option value="base">Bases</option>
                    <option value="flower">Fleurs</option>
                    <option value="fruit">Fruits</option>
                    <option value="vegetal">Plantes</option>
                    <option value="aroma">{t("admin.pages.ingredients.aromes_naturels")}</option>
                  </select>
                </div>

                {/* Prix */}
                <div>
                  <label className={labelClass}>Prix (€) *</label>
                  <input type="number" step="0.01" className={inputClass} value={formData.basePrice} onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })} required/>
                </div>

                {/* Stock */}
                <div>
                  <label className={labelClass}>Stock (g) *</label>
                  <input type="number" className={inputClass} value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} required/>
                </div>

                {/* Couleur */}
                <div>
                  <label className={labelClass}>Couleur</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="admin-color"/>
                    <input type="text" className={inputClass} value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} placeholder="#7C9A6B" pattern="^#[0-9A-Fa-f]{6}$" style={{ flex: 1 }}/>
                  </div>
                </div>

                {/* Intensité */}
                <div>
                  <label className={labelClass}>{t("admin.pages.ingredients.intensity")}</label>
                  <select className={inputClass} value={formData.intensity} onChange={(e) => setFormData({ ...formData, intensity: parseInt(e.target.value) })}>
                    <option value={1}>{t("admin.pages.ingredients.doux")}</option>
                    <option value={2}>2 - doux mais perceptible</option>
                    <option value={3}>{t("admin.pages.ingredients.net_equilibre")}</option>
                    <option value={4}>{t("admin.pages.ingredients.strong_bien_bold")}</option>
                    <option value={5}>{t("admin.pages.ingredients.strong_bold")}</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Umami (1-5)</label>
                  <select className={inputClass} value={formData.umami} onChange={(e) => setFormData({ ...formData, umami: parseInt(e.target.value) })}>
                    <option value={1}>1 - quasi absent</option>
                    <option value={2}>{t("admin.pages.ingredients.legere_rondeur")}</option>
                    <option value={3}>{t("admin.pages.ingredients.present_harmonieux")}</option>
                    <option value={4}>{t("admin.pages.ingredients.bold_rond")}</option>
                    <option value={5}>{t("admin.pages.ingredients.present_enveloppant")}</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>{t("admin.pages.ingredients.sweetness")}</label>
                  <select className={inputClass} value={formData.sweetness} onChange={(e) => setFormData({ ...formData, sweetness: parseInt(e.target.value) })}>
                    <option value={1}>1 - sec, peu doux</option>
                    <option value={2}>{t("admin.pages.ingredients.legerement_doux")}</option>
                    <option value={3}>{t("admin.pages.ingredients.softness_moderee")}</option>
                    <option value={4}>4 - doux, gourmand</option>
                    <option value={5}>{t("admin.pages.ingredients.doux_gourmand")}</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>{t("admin.pages.ingredients.body")}</label>
                  <select className={inputClass} value={formData.thickness} onChange={(e) => setFormData({ ...formData, thickness: parseInt(e.target.value) })}>
                    <option value={1}>{t("admin.pages.ingredients.light_fluide")}</option>
                    <option value={2}>{t("admin.pages.ingredients.light_peu_rond")}</option>
                    <option value={3}>3 - rond, souple</option>
                    <option value={4}>{t("admin.pages.ingredients.dense_velvety")}</option>
                    <option value={5}>{t("admin.pages.ingredients.dense_sirupeux")}</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Finale (1-5)</label>
                  <select className={inputClass} value={formData.finish} onChange={(e) => setFormData({ ...formData, finish: parseInt(e.target.value) })}>
                    <option value={1}>{t("admin.pages.ingredients.disparait_vite")}</option>
                    <option value={2}>2 - courte mais nette</option>
                    <option value={3}>3 - moyenne, persistante</option>
                    <option value={4}>4 - longue, expressive</option>
                    <option value={5}>{t("admin.pages.ingredients.longue_evolutive")}</option>
                  </select>
                </div>
              </div>


              {/* Description */}
              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>Description</label>
                <textarea className={inputClass} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} style={{ resize: 'vertical' }}/>
              </div>

              {/* Long Description */}
              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>Description longue</label>
                <textarea className={inputClass} value={formData.longDescription || ''} onChange={(e) => setFormData({ ...formData, longDescription: e.target.value })} rows={5} style={{ resize: 'vertical' }} placeholder={t("admin.pages.ingredients.texte_long_visible")}/>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>{t("admin.pages.ingredients.profile_aromatic")}</label>
                <textarea className={inputClass} value={formData.flavor} onChange={(e) => setFormData({ ...formData, flavor: e.target.value })} rows={3} style={{ resize: 'vertical' }}/>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>{t("admin.pages.ingredients.affini_tea")}</label>
                <textarea className={inputClass} value={formData.pairing} onChange={(e) => setFormData({ ...formData, pairing: e.target.value })} rows={3} style={{ resize: 'vertical' }}/>
              </div>

              {formData.category === 'base' && (<div style={{ marginTop: '1rem' }}>
                  <label className={labelClass}>{t("admin.pages.ingredients.moment_daytime")}</label>
                  <select multiple className={inputClass} value={formData.dayMoments} onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setFormData({ ...formData, dayMoments: selected });
                }} style={{ height: '120px' }}>
                    {DAY_MOMENT_OPTIONS.map((option) => (<option key={option} value={option}>{option}</option>))}
                  </select>
                </div>)}

              {formData.category === 'base' && (<div className="admin-grid-2" style={{ marginTop: '1rem' }}>
                  <div>
                    <label className={labelClass}>{t("admin.pages.ingredients.infusion_time")}</label>
                    <input type="text" className={inputClass} value={formData.infusionTime} onChange={(e) => setFormData({ ...formData, infusionTime: e.target.value })} placeholder={t("admin.pages.ingredients.infusion_time_placeholder")}/>
                  </div>
                  <div>
                    <label className={labelClass}>{t("admin.pages.ingredients.dosage")}</label>
                    <input type="text" className={inputClass} value={formData.dosage} onChange={(e) => setFormData({ ...formData, dosage: e.target.value })} placeholder={t("admin.pages.ingredients.dosage_placeholder")}/>
                  </div>
                  <div>
                    <label className={labelClass}>{t("admin.pages.ingredients.temperature")}</label>
                    <input type="text" className={inputClass} value={formData.temperature} onChange={(e) => setFormData({ ...formData, temperature: e.target.value })} placeholder={t("admin.pages.ingredients.temperature_placeholder")}/>
                  </div>
                  <div>
                    <label className={labelClass}>{t("admin.pages.ingredients.origin")}</label>
                    <input type="text" className={inputClass} value={formData.origin} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder={t("admin.pages.ingredients.origin_placeholder")}/>
                  </div>
                </div>)}

              {formData.category === 'base' && (<div style={{ marginTop: '1rem' }}>
                  <label className={labelClass}>{t("admin.pages.ingredients.preparation")}</label>
                  <textarea className={inputClass} value={formData.preparation} onChange={(e) => setFormData({ ...formData, preparation: e.target.value })} rows={4} style={{ resize: 'vertical' }}/>
                </div>)}

              {/* Image */}
              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>Image</label>
                {imagePreview && (<div style={{ marginBottom: '0.5rem' }}>
                    <img src={imagePreview} alt="Preview" style={{ height: '128px', width: '128px', borderRadius: '0.75rem', border: '1px solid var(--border)', objectFit: 'cover' }}/>
                  </div>)}
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'block', marginBottom: '0.5rem' }}/>
                {imageError && (<div className="admin-alert" style={{ marginBottom: '0.5rem' }}>
                    {imageError}
                  </div>)}
                <input type="text" className={inputClass} value={formData.image} onChange={(e) => {
                setFormData({ ...formData, image: e.target.value });
                setImagePreview(e.target.value);
            }} placeholder={t("admin.pages.ingredients.url_image")}/>
              </div>

              {/* Bienfaits */}
              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>{t("admin.pages.ingredients.benefits_selection_multiple")}</label>
                <select multiple className={inputClass} value={formData.benefits} onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setFormData({ ...formData, benefits: selected });
            }} style={{ height: '120px' }}>
                  {BENEFITS_OPTIONS_SORTED.map(benefit => (<option key={benefit} value={benefit}>{benefit}</option>))}
                </select>
                <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)' }}>{t("admin.pages.ingredients.maintenez_ctrl_cmd")}</p>
              </div>

              {/* Saveurs */}
              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>{t("admin.pages.ingredients.flavors_selection_multiple")}</label>
                <select multiple className={inputClass} value={formData.flavors} onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, option => option.value);
                setFormData({ ...formData, flavors: selected });
            }} style={{ height: '120px' }}>
                  {FLAVOR_OPTIONS_SORTED.map(flavor => (<option key={flavor} value={flavor}>{flavor}</option>))}
                </select>
                <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--muted)' }}>{t("admin.pages.ingredients.maintenez_ctrl_cmd")}</p>
              </div>

              {/* Actif */}
              <div style={{ marginTop: '1rem' }}>
                <label className={labelClass}>Statut</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <input type="radio" name="isActive" checked={formData.isActive === true} onChange={() => setFormData({ ...formData, isActive: true })}/>
                    Actif
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <input type="radio" name="isActive" checked={formData.isActive === false} onChange={() => setFormData({ ...formData, isActive: false })}/>
                    Inactif
                  </label>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                  Annuler
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  {editingId ? t("admin.pages.ingredients.edit") : t("admin.pages.ingredients.add")}
                </button>
              </div>
            </form>
          </div>
        </div>)}

        {deleteTarget && (<div className="admin-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-card-title" style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{t("admin.pages.ingredients.delete_ingredient")}</h2>
            <p style={{ marginBottom: '1.5rem', color: 'var(--muted)' }}>{t("admin.pages.ingredients.etes_vous_vouloir")}<strong>{deleteTarget.name}</strong> ?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setDeleteTarget(null)}>
                Annuler
              </button>
              <button type="button" className="admin-btn admin-btn-danger" onClick={confirmDelete}>{t("admin.pages.ingredients.delete")}</button>
            </div>
          </div>
        </div>)}
      </div>
    </Layout>);
}
