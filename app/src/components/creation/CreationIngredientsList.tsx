import { Minus } from 'lucide-react';
import { sortIngredientsByCategoryOrder } from '@/lib/ingredient-order';

export interface CreationIngredientListItem {
  id?: string;
  name: string;
  color?: string;
  category?: string;
}

interface CreationIngredientsListProps {
  ingredients: CreationIngredientListItem[];
  onRemoveIngredient?: (ingredientId: string) => void;
  emptyText?: string;
  className?: string;
}

export function CreationIngredientsList({
  ingredients,
  onRemoveIngredient,
  emptyText = 'Sélectionnez vos ingrédients pour commencer',
  className = '',
}: CreationIngredientsListProps) {
  const orderedIngredients = sortIngredientsByCategoryOrder(ingredients);

  return (
    <div className={`space-y-2 max-h-48 overflow-y-auto ${className}`.trim()}>
      {orderedIngredients.length === 0 ? (
        <p className="text-center text-[var(--sage-deep)]/40 text-sm py-4">{emptyText}</p>
      ) : (
        orderedIngredients.map((ingredient, index) => (
          <div
            key={ingredient.id || `${ingredient.name}-${index}`}
            className="flex items-center justify-between p-2 rounded-lg bg-[var(--cream-apothecary)]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: ingredient.color || '#6B7280' }}
              />
              <span className="text-sm text-[var(--sage-deep)] truncate">{ingredient.name}</span>
            </div>
            {onRemoveIngredient && ingredient.id ? (
              <button
                type="button"
                onClick={() => onRemoveIngredient(ingredient.id!)}
                className="p-1 hover:bg-red-100 rounded transition-colors shrink-0"
                aria-label={`Retirer ${ingredient.name}`}
              >
                <Minus className="w-3 h-3 text-red-500" />
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
