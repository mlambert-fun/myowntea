import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Ingredient } from '@/data/ingredients';

interface BlendContextType {
  selectedIngredients: Ingredient[];
  blendName: string;
  currentStep: number;
  addIngredient: (ingredient: Ingredient) => void;
  removeIngredient: (ingredientId: string) => void;
  setBlendName: (name: string) => void;
  setCurrentStep: (step: number) => void;
  clearBlend: () => void;
  isIngredientSelected: (ingredientId: string) => boolean;
  canAddMore: boolean;
  totalPrice: number;
  getBlendColor: () => string;
}

const MAX_INGREDIENTS = 10;
const BASE_PRICE = 7.50;
const PRICE_PER_INGREDIENT = 0.75;

const BlendContext = createContext<BlendContextType | undefined>(undefined);

export function BlendProvider({ children }: { children: React.ReactNode }) {
  const [selectedIngredients, setSelectedIngredients] = useState<Ingredient[]>([]);
  const [blendName, setBlendName] = useState('');
  const [currentStep, setCurrentStep] = useState(0);

  const addIngredient = useCallback((ingredient: Ingredient) => {
    setSelectedIngredients(prev => {
      if (prev.length >= MAX_INGREDIENTS) return prev;
      if (prev.some(ing => ing.id === ingredient.id)) return prev;
      return [...prev, ingredient];
    });
  }, []);

  const removeIngredient = useCallback((ingredientId: string) => {
    setSelectedIngredients(prev => prev.filter(ing => ing.id !== ingredientId));
  }, []);

  const clearBlend = useCallback(() => {
    setSelectedIngredients([]);
    setBlendName('');
    setCurrentStep(0);
  }, []);

  const isIngredientSelected = useCallback((ingredientId: string) => {
    return selectedIngredients.some(ing => ing.id === ingredientId);
  }, [selectedIngredients]);

  const canAddMore = selectedIngredients.length < MAX_INGREDIENTS;

  const totalPrice = BASE_PRICE + (selectedIngredients.length * PRICE_PER_INGREDIENT);

  const getBlendColor = useCallback(() => {
    if (selectedIngredients.length === 0) return '#C4A77D';
    
    const baseIngredient = selectedIngredients.find(ing => ing.category === 'base');
    if (baseIngredient) return baseIngredient.color;
    
    const colors = selectedIngredients.map(ing => ing.color);
    return colors[0];
  }, [selectedIngredients]);

  return (
    <BlendContext.Provider
      value={{
        selectedIngredients,
        blendName,
        currentStep,
        addIngredient,
        removeIngredient,
        setBlendName,
        setCurrentStep,
        clearBlend,
        isIngredientSelected,
        canAddMore,
        totalPrice,
        getBlendColor
      }}
    >
      {children}
    </BlendContext.Provider>
  );
}

export function useBlend() {
  const context = useContext(BlendContext);
  if (context === undefined) {
    throw new Error('useBlend must be used within a BlendProvider');
  }
  return context;
}
