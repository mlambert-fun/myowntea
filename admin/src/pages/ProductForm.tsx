import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { t } from "../lib/i18n";
interface Product {
    id: string;
    title: string;
    slug: string;
    sku?: string | null;
    type: string;
    ranking: number;
    description?: string | null;
    additionalDetails?: string | null;
    tags?: string[];
    images?: string[];
    priceCents: number;
    stockQty?: number | null;
    isActive: boolean;
}
interface OptionValue {
    id: string;
    value: string;
    optionId: string;
    optionName?: string;
}
interface ProductOption {
    id: string;
    name: string;
    position: number;
    values: OptionValue[];
}
interface Variant {
    id: string;
    sku?: string | null;
    priceCents: number;
    stockQty?: number | null;
    imageUrl?: string | null;
    images?: string[];
    isActive: boolean;
    optionValues?: OptionValue[];
}
const emptyForm = {
    title: '',
    slug: '',
    sku: '',
    type: 'ACCESSORY',
    description: '',
    additionalDetails: '',
    tags: '',
    ranking: '0',
    priceCents: '',
    stockQty: '',
    isActive: true,
};
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const validateImageFile = (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return t("admin.pages.product_form.format_non_supported");
    }
    if (file.size > MAX_IMAGE_BYTES) {
        return 'Image trop lourde (max 5 Mo).';
    }
    return null;
};
async function optimizeImageFile(file: File): Promise<File> {
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
    return new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), { type: 'image/webp' });
}
const parseTagsInput = (value: string) => Array.from(new Set(value
    .split(/[,\n;|]+/g)
    .map((tag) => tag.trim())
    .filter(Boolean)));
export default function ProductForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [product, setProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState(emptyForm);
    const [slugTouched, setSlugTouched] = useState(false);
    const [productError, setProductError] = useState<string | null>(null);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [options, setOptions] = useState<ProductOption[]>([]);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [productImages, setProductImages] = useState<string[]>([]);
    const [productImageError, setProductImageError] = useState<string | null>(null);
    const [newOptionName, setNewOptionName] = useState('');
    const [newOptionPosition, setNewOptionPosition] = useState('0');
    const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
    const [variantForm, setVariantForm] = useState({
        sku: '',
        priceCents: '',
        stockQty: '',
        images: [] as string[],
        isActive: true,
        optionValueIds: [] as string[],
    });
    const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
    const [variantError, setVariantError] = useState<string | null>(null);
    const [variantImageError, setVariantImageError] = useState<string | null>(null);
    const [showOptionForm, setShowOptionForm] = useState(false);
    const [showVariantForm, setShowVariantForm] = useState(false);
    const isNew = id === 'new' || !id;
    useEffect(() => {
        loadAllProducts();
        if (isNew) {
            setLoading(false);
            return;
        }
        loadProduct(id);
    }, [id]);
    async function loadProduct(productId: string | undefined) {
        if (!productId)
            return;
        setLoading(true);
        try {
            const data = await api.getAdminProduct(productId);
            setProduct(data);
            setFormData({
                title: data.title,
                slug: data.slug,
                sku: data.sku || '',
                type: data.type,
                description: data.description || '',
                additionalDetails: data.additionalDetails || '',
                tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
                ranking: String(data.ranking ?? 0),
                priceCents: data.priceCents !== undefined && data.priceCents !== null
                    ? (data.priceCents / 100).toFixed(2)
                    : '',
                stockQty: data.stockQty !== undefined && data.stockQty !== null ? String(data.stockQty) : '',
                isActive: data.isActive,
            });
            setProductImages(Array.isArray(data.images) ? data.images : []);
            setSlugTouched(true);
            await Promise.all([loadOptions(productId), loadVariants(productId)]);
        }
        catch (error) {
            console.error('Failed to load product', error);
        }
        finally {
            setLoading(false);
        }
    }
    async function loadAllProducts() {
        try {
            const data = await api.getAdminProducts();
            setAllProducts(Array.isArray(data) ? data : []);
        }
        catch (error) {
            console.error('Failed to load products', error);
        }
    }
    async function loadOptions(productId: string) {
        const data = await api.getProductOptions(productId);
        setOptions(Array.isArray(data) ? data : []);
    }
    async function loadVariants(productId: string) {
        const data = await api.getProductVariants(productId);
        setVariants(Array.isArray(data) ? data : []);
    }
    async function handleSaveProduct(e: React.FormEvent) {
        e.preventDefault();
        try {
            setProductError(null);
            if (!formData.title.trim() || !formData.slug.trim()) {
                setProductError(t("admin.pages.product_form.titre_slug_required"));
                return;
            }
            const uniqueSlug = buildUniqueSlug(formData.slug, formData.slug);
            if (uniqueSlug !== formData.slug) {
                setFormData((prev) => ({ ...prev, slug: uniqueSlug }));
            }
            const payload = {
                ...formData,
                slug: uniqueSlug,
                tags: parseTagsInput(formData.tags),
                ranking: Math.max(0, Math.round(Number(formData.ranking) || 0)),
                images: productImages,
                priceCents: formData.priceCents ? Math.round(Number(formData.priceCents) * 100) : 0,
                stockQty: formData.stockQty ? Number(formData.stockQty) : null,
            };
            if (isNew) {
                const created = await api.createProduct(payload);
                navigate(`/products/${created.id}`);
            }
            else if (product?.id) {
                await api.updateProduct(product.id, payload);
                await loadProduct(product.id);
            }
        }
        catch (error) {
            console.error('Failed to save product', error);
        }
    }
    async function handleProductImageUpload(file?: File | null) {
        if (!file)
            return;
        const validation = validateImageFile(file);
        if (validation) {
            setProductImageError(validation);
            return;
        }
        setProductImageError(null);
        const folder = `products/${formData.slug || product?.slug || 'new'}`;
        try {
            const optimized = await optimizeImageFile(file);
            const response = await api.uploadImage(optimized, folder);
            setProductImages((prev) => [...prev, response.url]);
        }
        catch (error) {
            console.error('Product image upload failed', error);
            try {
                const response = await api.uploadImage(file, folder);
                setProductImages((prev) => [...prev, response.url]);
            }
            catch (uploadError) {
                console.error('Product image upload fallback failed', uploadError);
                setProductImageError(t("admin.pages.product_form.upload_failed_reessayez"));
            }
        }
    }
    function handleRemoveProductImage(targetUrl: string) {
        setProductImages((prev) => prev.filter((url) => url !== targetUrl));
    }
    async function handleCreateOption(e: React.FormEvent) {
        e.preventDefault();
        if (!product?.id)
            return;
        try {
            await api.createOption(product.id, { name: newOptionName, position: Number(newOptionPosition) });
            setNewOptionName('');
            setNewOptionPosition('0');
            setShowOptionForm(false);
            await loadOptions(product.id);
        }
        catch (error) {
            console.error('Failed to create option', error);
        }
    }
    async function handleDeleteOption(optionId: string) {
        if (!window.confirm(t("admin.pages.product_form.delete_option")))
            return;
        try {
            await api.deleteOption(optionId);
            if (product?.id)
                await loadOptions(product.id);
        }
        catch (error) {
            console.error('Failed to delete option', error);
        }
    }
    async function handleCreateValue(optionId: string) {
        const value = valueDrafts[optionId];
        if (!value)
            return;
        try {
            await api.createOptionValue(optionId, { value, position: 0 });
            setValueDrafts((prev) => ({ ...prev, [optionId]: '' }));
            if (product?.id)
                await loadOptions(product.id);
        }
        catch (error) {
            console.error('Failed to create value', error);
        }
    }
    async function handleDeleteValue(valueId: string) {
        if (!window.confirm(t("admin.pages.product_form.delete_value")))
            return;
        try {
            await api.deleteOptionValue(valueId);
            if (product?.id)
                await loadOptions(product.id);
        }
        catch (error) {
            console.error('Failed to delete value', error);
        }
    }
    async function handleSaveVariant(e: React.FormEvent) {
        e.preventDefault();
        if (!product?.id)
            return;
        try {
            setVariantError(null);
            if (!variantForm.priceCents || Number.isNaN(Number(variantForm.priceCents))) {
                setVariantError(t("admin.pages.product_form.price_required"));
                return;
            }
            const optionsWithValues = options.filter((option) => option.values.length > 0);
            if (optionsWithValues.length > 0) {
                const selectedByOption = new Map<string, string>();
                for (const option of optionsWithValues) {
                    const found = option.values.find((val) => variantForm.optionValueIds.includes(val.id));
                    if (!found) {
                        setVariantError(`Sélectionnez une valeur pour l'option "${option.name}".`);
                        return;
                    }
                    selectedByOption.set(option.id, found.id);
                }
            }
            const payload = {
                sku: variantForm.sku || null,
                priceCents: Number(variantForm.priceCents),
                stockQty: variantForm.stockQty ? Number(variantForm.stockQty) : null,
                images: variantForm.images,
                isActive: variantForm.isActive,
                optionValueIds: variantForm.optionValueIds,
            };
            if (editingVariantId) {
                await api.updateVariant(editingVariantId, payload);
            }
            else {
                await api.createVariant(product.id, payload);
            }
            resetVariantForm();
            setShowVariantForm(false);
            await loadVariants(product.id);
        }
        catch (error) {
            console.error('Failed to save variant', error);
        }
    }
    function resetVariantForm() {
        setEditingVariantId(null);
        setVariantError(null);
        setVariantForm({ sku: '', priceCents: '', stockQty: '', images: [], isActive: true, optionValueIds: [] });
    }
    function startEditVariant(variant: Variant) {
        setEditingVariantId(variant.id);
        setVariantError(null);
        setShowVariantForm(true);
        setVariantForm({
            sku: variant.sku || '',
            priceCents: String(variant.priceCents),
            stockQty: variant.stockQty !== null && variant.stockQty !== undefined ? String(variant.stockQty) : '',
            images: Array.isArray(variant.images)
                ? variant.images
                : (variant.imageUrl ? [variant.imageUrl] : []),
            isActive: variant.isActive,
            optionValueIds: (variant.optionValues || []).map((val) => val.id),
        });
    }
    function duplicateVariant(variant: Variant) {
        const existingSkus = variants.map((item) => item.sku).filter(Boolean) as string[];
        const baseSku = (variant.sku || 'SKU').trim();
        const nextSku = buildUniqueSku(baseSku, existingSkus);
        setEditingVariantId(null);
        setVariantError(null);
        setVariantForm({
            sku: nextSku,
            priceCents: String(variant.priceCents),
            stockQty: variant.stockQty !== null && variant.stockQty !== undefined ? String(variant.stockQty) : '',
            images: Array.isArray(variant.images)
                ? variant.images
                : (variant.imageUrl ? [variant.imageUrl] : []),
            isActive: variant.isActive,
            optionValueIds: (variant.optionValues || []).map((val) => val.id),
        });
    }
    async function handleDeleteVariant(variantId: string) {
        if (!window.confirm(t("admin.pages.product_form.delete_variant")))
            return;
        try {
            await api.deleteVariant(variantId);
            if (product?.id)
                await loadVariants(product.id);
        }
        catch (error) {
            console.error('Failed to delete variant', error);
        }
    }
    async function handleVariantImageUpload(file?: File | null) {
        if (!file)
            return;
        const validation = validateImageFile(file);
        if (validation) {
            setVariantImageError(validation);
            return;
        }
        setVariantImageError(null);
        const folder = `products/${formData.slug || product?.slug || 'new'}/variants`;
        try {
            const optimized = await optimizeImageFile(file);
            const response = await api.uploadImage(optimized, folder);
            setVariantForm((prev) => ({ ...prev, images: [...prev.images, response.url] }));
        }
        catch (error) {
            console.error('Variant image upload failed', error);
            try {
                const response = await api.uploadImage(file, folder);
                setVariantForm((prev) => ({ ...prev, images: [...prev.images, response.url] }));
            }
            catch (uploadError) {
                console.error('Variant image upload fallback failed', uploadError);
                setVariantImageError(t("admin.pages.product_form.upload_failed_reessayez"));
            }
        }
    }
    function toggleOptionValue(valueId: string) {
        setVariantForm((prev) => {
            const exists = prev.optionValueIds.includes(valueId);
            return {
                ...prev,
                optionValueIds: exists
                ? prev.optionValueIds.filter((id) => id !== valueId)
                    : [...prev.optionValueIds, valueId],
            };
        });
    }
    function handleRemoveVariantImage(targetUrl: string) {
        setVariantImageError(null);
        setVariantForm((prev) => ({ ...prev, images: prev.images.filter((imageUrl) => imageUrl !== targetUrl) }));
    }
    const hasOptions = useMemo(() => options.some((option) => option.values.length > 0), [options]);
    const optionsWithValues = useMemo(() => options.filter((option) => option.values.length > 0), [options]);
    const incompleteOptions = useMemo(() => options.filter((option) => option.values.length === 0), [options]);
    const expectedVariantCount = useMemo(() => {
        if (optionsWithValues.length === 0)
            return 0;
        return optionsWithValues.reduce((total, option) => total * option.values.length, 1);
    }, [optionsWithValues]);
    const slugify = (value: string) => value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    const buildUniqueSlug = (rawSlug: string, fallback: string) => {
        const base = slugify(rawSlug || fallback);
        if (!base)
            return '';
        const existing = allProducts
            .filter((item) => item.id !== product?.id)
            .map((item) => item.slug);
        if (!existing.includes(base))
            return base;
        let counter = 2;
        while (existing.includes(`${base}-${counter}`)) {
            counter += 1;
        }
        return `${base}-${counter}`;
    };
    const buildUniqueSku = (baseSku: string, existingSkus: string[]) => {
        const normalized = baseSku.replace(/\s+/g, '-').toUpperCase();
        let candidate = `${normalized}-COPY`;
        if (!existingSkus.includes(candidate))
            return candidate;
        let counter = 2;
        while (existingSkus.includes(`${normalized}-COPY-${counter}`)) {
            counter += 1;
        }
        return `${normalized}-COPY-${counter}`;
    };
    return (<Layout>
      <div className="admin-page admin-page-premium-lite">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">{isNew ? 'Nouveau produit' : t("admin.pages.product_form.edit_product")}</h1>
            <p className="admin-subtitle">{t("admin.pages.product_form.management_options_variants")}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link className="admin-btn" to="/products">{t("admin.pages.product_form.back_list")}</Link>
          </div>
        </div>

        {loading ? (<div className="admin-card">{t("admin.pages.translations.loading")}</div>) : (<>
            <div className="admin-card">
              <h2 className="admin-card-title">Informations produit</h2>
              <form onSubmit={handleSaveProduct} className="admin-form-grid">
              <div>
                <label className="admin-label">Titre</label>
                <input className="admin-input" value={formData.title} onChange={(e) => {
                const nextTitle = e.target.value;
                setFormData((prev) => ({
                    ...prev,
                    title: nextTitle,
                    slug: slugTouched ? prev.slug : buildUniqueSlug(nextTitle, nextTitle),
                }));
            }} required/>
              </div>
              <div>
                <label className="admin-label">Slug</label>
                <input className="admin-input" value={formData.slug} onChange={(e) => {
                setSlugTouched(true);
                setFormData({ ...formData, slug: e.target.value });
            }} onBlur={() => {
                const unique = buildUniqueSlug(formData.slug, formData.title);
                setFormData((prev) => ({ ...prev, slug: unique }));
            }} required/>
              </div>
              <div>
                <label className="admin-label">Type</label>
                <select className="admin-input" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                  <option value="ACCESSORY">ACCESSORY</option>
                  <option value="PACK">PACK</option>
                  <option value="SUBSCRIPTION">SUBSCRIPTION</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
              <div>
                <label className="admin-label">SKU</label>
                <input className="admin-input" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })}/>
              </div>
              <div>
                <label className="admin-label">Ranking</label>
                <input className="admin-input" type="number" min={0} value={formData.ranking} onChange={(e) => setFormData({ ...formData, ranking: e.target.value })}/>
              </div>
              <div>
                <label className="admin-label">Prix (€)</label>
                <input className="admin-input" type="number" step="0.01" value={formData.priceCents} onChange={(e) => setFormData({ ...formData, priceCents: e.target.value })}/>
              </div>
              <div>
                <label className="admin-label">Stock</label>
                <input className="admin-input" type="number" value={formData.stockQty} onChange={(e) => setFormData({ ...formData, stockQty: e.target.value })}/>
              </div>
              <div>
                <label className="admin-label">Actif</label>
                <select className="admin-input" value={formData.isActive ? 'true' : 'false'} onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}>
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">Description</label>
                <textarea className="admin-input" rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}/>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">{t("admin.pages.product_form.additional_details")}</label>
                <textarea className="admin-input" rows={5} value={formData.additionalDetails} onChange={(e) => setFormData({ ...formData, additionalDetails: e.target.value })}/>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">{t("admin.pages.product_form.tags")}</label>
                <input className="admin-input" value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })}/>
                <p className="admin-muted" style={{ marginTop: '0.5rem' }}>{t("admin.pages.product_form.tags_hint")}</p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="admin-label">Images</label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {productImages.map((imageUrl) => (<div key={imageUrl} style={{
                    width: 72,
                    height: 72,
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: '#fff',
                    position: 'relative',
                }}>
                      <img src={imageUrl} alt="Miniature" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                      <button type="button" onClick={() => handleRemoveProductImage(imageUrl)} className="admin-btn" style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    padding: '0 0.35rem',
                    background: 'rgba(255,255,255,0.9)',
                }}>
                        ×
                      </button>
                    </div>))}
                  <label style={{
                width: 72,
                height: 72,
                borderRadius: '0.75rem',
                border: '1px dashed var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--muted)',
                background: '#fff',
            }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleProductImageUpload(e.target.files?.[0])}/>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </label>
                </div>
                {productImageError && (<div className="admin-alert" style={{ marginTop: '0.5rem' }}>
                    {productImageError}
                  </div>)}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="admin-btn admin-btn-primary" type="submit">
                  {isNew ? t("admin.pages.product_form.create") : t("admin.pages.product_form.mettre_day")}
                </button>
              </div>
              {productError && <div className="admin-alert">{productError}</div>}
            </form>
          </div>

            {!isNew && (<>
                <div className="admin-card">
                  <div className="admin-header" style={{ marginBottom: '1rem' }}>
                    <h2 className="admin-card-title">Options</h2>
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setShowOptionForm((prev) => !prev)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>{t("admin.pages.product_form.add_option")}</button>
                  </div>
                  {showOptionForm && (<form onSubmit={handleCreateOption} className="admin-form-grid">
                      <div>
                        <label className="admin-label">Nom</label>
                        <input className="admin-input" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)} required/>
                      </div>
                      <div>
                        <label className="admin-label">Position</label>
                        <input className="admin-input" type="number" value={newOptionPosition} onChange={(e) => setNewOptionPosition(e.target.value)}/>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="admin-btn admin-btn-primary" type="submit">{t("admin.pages.product_form.add")}</button>
                      </div>
                    </form>)}
                <div className="admin-grid-2" style={{ marginTop: '1.5rem' }}>
                  {options.map((option) => (<div key={option.id} className="admin-card" style={{ background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <div>
                          <p style={{ fontWeight: 600 }}>{option.name}</p>
                          <p className="admin-muted">Position {option.position}</p>
                        </div>
                        <button className="admin-icon-button admin-icon-button-danger" onClick={() => handleDeleteOption(option.id)} title={t("admin.pages.product_form.delete")} aria-label={t("admin.pages.product_form.delete")}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                      <div style={{ marginTop: '1rem' }}>
                        <p className="admin-muted">Valeurs</p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {option.values.map((value) => (<span key={value.id} className="admin-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                              {value.value}
                              <button className="admin-icon-button admin-icon-button-danger" style={{ width: '22px', height: '22px' }} onClick={() => handleDeleteValue(value.id)} type="button" title={t("admin.pages.product_form.delete")} aria-label={t("admin.pages.product_form.delete")}>×</button>
                            </span>))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                          <input className="admin-input" placeholder="Nouvelle valeur" value={valueDrafts[option.id] || ''} onChange={(e) => setValueDrafts((prev) => ({
                        ...prev,
                        [option.id]: e.target.value,
                    }))}/>
                          <button className="admin-btn admin-btn-secondary" type="button" onClick={() => handleCreateValue(option.id)}>{t("admin.pages.product_form.add")}</button>
                        </div>
                      </div>
                    </div>))}
                </div>
              </div>

                <div className="admin-card">
                  <div className="admin-header" style={{ marginBottom: '1rem' }}>
                    <h2 className="admin-card-title">Variantes</h2>
                    <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setShowVariantForm((prev) => !prev)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>{t("admin.pages.product_form.add_variant")}</button>
                  </div>
                {!hasOptions && (<p className="admin-muted" style={{ marginBottom: '1rem' }}>{t("admin.pages.product_form.add_options_values")}</p>)}
                {incompleteOptions.length > 0 && (<div className="admin-alert" style={{ marginBottom: '1rem' }}>{t("admin.pages.product_form.certaines_options_ont")}{' '}
                    {incompleteOptions.map((opt) => opt.name).join(', ')}.
                  </div>)}
                  {showVariantForm && (<form onSubmit={handleSaveVariant} className="admin-form-grid">
                      <div>
                        <label className="admin-label">SKU</label>
                        <input className="admin-input" value={variantForm.sku} onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}/>
                      </div>
                      <div>
                        <label className="admin-label">Prix (cents)</label>
                        <input className="admin-input" type="number" value={variantForm.priceCents} onChange={(e) => setVariantForm({ ...variantForm, priceCents: e.target.value })} required/>
                      </div>
                      <div>
                        <label className="admin-label">Stock</label>
                        <input className="admin-input" type="number" value={variantForm.stockQty} onChange={(e) => setVariantForm({ ...variantForm, stockQty: e.target.value })}/>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="admin-label">Images</label>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                          {variantForm.images.map((imageUrl) => (<div key={imageUrl} style={{
                            width: 72,
                            height: 72,
                            borderRadius: '0.75rem',
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                            background: '#fff',
                            position: 'relative',
                        }}>
                              <img src={imageUrl} alt="Miniature" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                              <button type="button" onClick={() => handleRemoveVariantImage(imageUrl)} className="admin-btn" style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            padding: '0 0.35rem',
                            background: 'rgba(255,255,255,0.9)',
                        }} title={t("admin.pages.product_form.delete")} aria-label={t("admin.pages.product_form.delete")}>
                                ×
                              </button>
                            </div>))}
                          <label style={{
                        width: 72,
                        height: 72,
                        borderRadius: '0.75rem',
                        border: '1px dashed var(--border)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                        background: '#fff',
                    }}>
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleVariantImageUpload(e.target.files?.[0])}/>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </label>
                        </div>
                        {variantImageError && (<div className="admin-alert" style={{ marginTop: '0.5rem' }}>
                            {variantImageError}
                          </div>)}
                      </div>
                      <div>
                        <label className="admin-label">Actif</label>
                        <select className="admin-input" value={variantForm.isActive ? 'true' : 'false'} onChange={(e) => setVariantForm({ ...variantForm, isActive: e.target.value === 'true' })}>
                          <option value="true">Oui</option>
                          <option value="false">Non</option>
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="admin-label">Options</label>
                        <div className="admin-grid-2">
                          {options.map((option) => (<div key={option.id} className="admin-card" style={{ background: '#fff' }}>
                              <p style={{ fontWeight: 600 }}>{option.name}</p>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                                {option.values.map((value) => (<label key={value.id} className="admin-chip">
                                    <input type="checkbox" checked={variantForm.optionValueIds.includes(value.id)} onChange={() => toggleOptionValue(value.id)}/>
                                    <span>{value.value}</span>
                                  </label>))}
                              </div>
                            </div>))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="admin-btn admin-btn-primary" type="submit">
                          {editingVariantId ? t("admin.pages.product_form.mettre_day") : t("admin.pages.product_form.create")}
                        </button>
                        {editingVariantId && (<button className="admin-btn" type="button" onClick={resetVariantForm}>
                            Annuler
                          </button>)}
                      </div>
                      {variantError && <div className="admin-alert">{variantError}</div>}
                      {hasOptions && optionsWithValues.length > 0 && (<div className="admin-muted" style={{ gridColumn: '1 / -1' }}>{t("admin.pages.product_form.select_value_option")}</div>)}
                    </form>)}

                <div className="admin-table-wrapper" style={{ marginTop: '1.5rem' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Prix</th>
                        <th>Stock</th>
                        <th>Options</th>
                        <th>Actif</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((variant) => (<tr key={variant.id}>
                          <td>{variant.sku || '-'}</td>
                          <td>{(variant.priceCents / 100).toFixed(2)} €</td>
                          <td>{variant.stockQty === null ? '?' : variant.stockQty}</td>
                          <td>
                            {(variant.optionValues || [])
                        .map((value) => `${value.optionName || 'Option'}: ${value.value}`)
                        .join(' | ') || '?'}
                          </td>
                          <td>{variant.isActive ? 'Oui' : 'Non'}</td>
                          <td style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="admin-btn admin-btn-secondary" onClick={() => startEditVariant(variant)}>{t("admin.pages.product_form.edit")}</button>
                            <button className="admin-btn admin-btn-secondary" onClick={() => duplicateVariant(variant)}>
                              Dupliquer
                            </button>
                            <button className="admin-icon-button admin-icon-button-danger" onClick={() => handleDeleteVariant(variant.id)} title={t("admin.pages.product_form.delete")} aria-label={t("admin.pages.product_form.delete")}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M3 6h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>
                {expectedVariantCount > 0 && variants.length < expectedVariantCount && (<div className="admin-alert" style={{ marginTop: '1rem' }}>{t("admin.pages.product_form.combinaisons_incompletes")}{variants.length} / {expectedVariantCount}{t("admin.pages.product_form.variants_created")}</div>)}
                </div>
              </>)}
          </>)}
      </div>
    </Layout>);
}
