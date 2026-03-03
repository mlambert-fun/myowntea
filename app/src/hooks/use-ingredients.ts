import { useState, useEffect, useRef } from 'react';
import { api, type Ingredient as APIIngredient } from '../api/client';

// Adapter pour transformer les ingrédients de l'API vers le format attendu par l'UI
export interface Ingredient {
  id: string;
  name: string;
  category: 'base' | 'flower' | 'fruit' | 'vegetal' | 'aroma';
  description: string;
  longDescription?: string | null;
  benefits: string[];
  intensity: 1 | 2 | 3 | 4 | 5;
  umami: 1 | 2 | 3 | 4 | 5;
  sweetness: 1 | 2 | 3 | 4 | 5;
  thickness: 1 | 2 | 3 | 4 | 5;
  finish: 1 | 2 | 3 | 4 | 5;
  color: string;
  image: string;
  basePrice: number;
  stock: number;
  dayMoments?: string[] | null;
  infusionTime?: string | null;
  dosage?: string | null;
  temperature?: string | null;
  preparation?: string | null;
  origin?: string | null;
  flavor?: string | null;
  pairing?: string | null;
  flavors?: string[];
}

const categoryMap: Record<string, 'base' | 'flower' | 'fruit' | 'vegetal' | 'aroma'> = {
  base: 'base',
  flower: 'flower',
  fruit: 'fruit',
  vegetal: 'vegetal',
  flavor: 'aroma',
  plant: 'vegetal',
  aroma: 'aroma',
  TEA: 'base',
  FLOWER: 'flower',
  FRUIT: 'fruit',
  HERB: 'vegetal',
  SPICE: 'aroma',
};

function adaptIngredient(apiIngredient: APIIngredient): Ingredient {
  return {
    id: apiIngredient.id,
    name: apiIngredient.name,
    category: categoryMap[apiIngredient.category] || 'base',
    description: apiIngredient.description || '',
    longDescription: apiIngredient.longDescription ?? null,
    benefits: apiIngredient.benefits || [],
    intensity: (Math.min(5, Math.max(1, apiIngredient.intensity ?? 3)) as 1 | 2 | 3 | 4 | 5),
    umami: (Math.min(5, Math.max(1, apiIngredient.umami ?? 3)) as 1 | 2 | 3 | 4 | 5),
    sweetness: (Math.min(5, Math.max(1, apiIngredient.sweetness ?? 3)) as 1 | 2 | 3 | 4 | 5),
    thickness: (Math.min(5, Math.max(1, apiIngredient.thickness ?? 3)) as 1 | 2 | 3 | 4 | 5),
    finish: (Math.min(5, Math.max(1, apiIngredient.finish ?? 3)) as 1 | 2 | 3 | 4 | 5),
    color: apiIngredient.color || '#6B7280',
    image: apiIngredient.image || apiIngredient.imageUrl || '/assets/misc/ingredient_placeholder.png',
    basePrice: apiIngredient.basePrice,
    stock: apiIngredient.stock,
    dayMoments: Array.isArray(apiIngredient.dayMoments) ? apiIngredient.dayMoments : null,
    infusionTime: apiIngredient.infusionTime ?? null,
    dosage: apiIngredient.dosage ?? null,
    temperature: apiIngredient.temperature ?? null,
    preparation: apiIngredient.preparation ?? null,
    origin: apiIngredient.origin ?? null,
    pairing: apiIngredient.pairing ?? null,
    flavor: apiIngredient.flavor ?? null,
    flavors: Array.isArray(apiIngredient.flavors) ? apiIngredient.flavors : [],
  };
}

export function useIngredients() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastSignatureRef = useRef('');

  useEffect(() => {
    let isMounted = true;

    async function loadIngredients(showLoading = false) {
      if (showLoading) setLoading(true);
      try {
        const data = await api.getIngredients();
        if (!isMounted) return;
        const nextIngredients = data.filter((ing) => ing.isActive !== false).map(adaptIngredient);
          const signature = nextIngredients
            .map((ing) => `${ing.id}|${ing.name}|${ing.category}|${ing.basePrice}|${ing.stock}|${ing.image}|${ing.intensity}|${ing.umami}|${ing.sweetness}|${ing.thickness}|${ing.finish}|${ing.longDescription || ''}|${(ing.dayMoments || []).join(',')}|${ing.infusionTime || ''}|${ing.dosage || ''}|${ing.temperature || ''}|${ing.preparation || ''}|${ing.origin || ''}|${ing.pairing || ''}|${ing.flavor || ''}|${(ing.flavors || []).join(',')}`)
            .join('::');
        if (signature !== lastSignatureRef.current) {
          lastSignatureRef.current = signature;
          setIngredients(nextIngredients);
        }
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load ingredients');
      } finally {
        if (showLoading && isMounted) setLoading(false);
      }
    }

    loadIngredients(true);

    const handleFocus = () => loadIngredients(false);
    window.addEventListener('focus', handleFocus);

    const refreshInterval = window.setInterval(() => {
      loadIngredients(false);
    }, 20000);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(refreshInterval);
    };
  }, []);

  return { ingredients, loading, error };
}
