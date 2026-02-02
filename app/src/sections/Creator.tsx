import { useState, useEffect, useRef } from 'react';
import { useBlend } from '@/context/BlendContext';
import { categories, getIngredientsByCategory, type Ingredient } from '@/data/ingredients';
import { 
  Leaf, Flower, Apple, Sprout, Sparkles, 
  Check, Minus,
  ShoppingBag, RotateCcw
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  Leaf,
  Flower,
  Apple,
  Sprout,
  Sparkles
};

export function Creator() {
  const {
    selectedIngredients,
    blendName,
    addIngredient,
    removeIngredient,
    setBlendName,
    isIngredientSelected,
    canAddMore,
    totalPrice,
    getBlendColor
  } = useBlend();

  const [activeCategory, setActiveCategory] = useState('base');
  const [showSummary, setShowSummary] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Falling leaves animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    interface Leaf {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
      color: string;
    }

    const leaves: Leaf[] = [];
    const colors = ['#7C9A6B', '#B8A9C9', '#E8B4B8', '#C4A77D', '#98FB98'];

    for (let i = 0; i < 15; i++) {
      leaves.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 8 + 4,
        speedY: Math.random() * 0.5 + 0.2,
        speedX: (Math.random() - 0.5) * 0.3,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        opacity: Math.random() * 0.3 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      leaves.forEach(leaf => {
        leaf.y += leaf.speedY;
        leaf.x += leaf.speedX + Math.sin(leaf.y * 0.01) * 0.3;
        leaf.rotation += leaf.rotationSpeed;

        if (leaf.y > canvas.height + leaf.size) {
          leaf.y = -leaf.size;
          leaf.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.rotation);
        ctx.globalAlpha = leaf.opacity;
        ctx.fillStyle = leaf.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, leaf.size, leaf.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const handleIngredientClick = (ingredient: Ingredient) => {
    if (isIngredientSelected(ingredient.id)) {
      removeIngredient(ingredient.id);
    } else if (canAddMore) {
      addIngredient(ingredient);
    }
  };

  const hasBase = selectedIngredients.some(ing => ing.category === 'base');
  const hasAdditional = selectedIngredients.some(ing => ing.category !== 'base');
  const canFinalize = hasBase && hasAdditional;

  const currentCategory = categories.find(cat => cat.id === activeCategory);
  const categoryIngredients = getIngredientsByCategory(activeCategory);

  return (
    <section 
      id="creator" 
      ref={sectionRef}
      className="relative min-h-screen w-full bg-[#FAF8F3] py-20"
    >
      {/* Falling Leaves Canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: 0.6 }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">
            L'Atelier du Maître Mélangeur
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--sage-deep)] mb-4">
            Créez Votre <span className="italic">Signature</span>
          </h2>
          <p className="text-[var(--sage-deep)]/60 max-w-xl mx-auto">
            Suivez les étapes et assemblez votre composition parfaite. 
            Jusqu'à 10 ingrédients pour un mélange harmonieux.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--sage-deep)]/60">
              {selectedIngredients.length} / 10 ingrédients
            </span>
            <span className="text-sm font-medium text-[var(--gold-antique)]">
              {Math.round((selectedIngredients.length / 10) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-[#E5E0D5] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[var(--gold-antique)] to-[#D4B872] transition-all duration-500"
              style={{ width: `${(selectedIngredients.length / 10) * 100}%` }}
            />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left: Tea Cup Visualization */}
          <div className="lg:col-span-2">
            <div className="sticky top-8">
              <div className="bg-white rounded-3xl p-8 shadow-lg">
                <h3 className="font-display text-xl text-[var(--sage-deep)] mb-6 text-center">
                  Votre Création
                </h3>
                
                {/* Tea Cup */}
                <div className="relative w-48 h-48 mx-auto mb-6">
                  {/* Steam */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2">
                    <div className="w-2 h-8 bg-gradient-to-t from-[var(--gold-antique)]/30 to-transparent rounded-full animation-steam" />
                    <div className="w-2 h-6 bg-gradient-to-t from-[var(--gold-antique)]/20 to-transparent rounded-full animation-steam absolute left-4 top-2" style={{ animationDelay: '0.5s' }} />
                    <div className="w-2 h-7 bg-gradient-to-t from-[var(--gold-antique)]/25 to-transparent rounded-full animation-steam absolute -left-4 top-1" style={{ animationDelay: '1s' }} />
                  </div>
                  
                  {/* Cup */}
                  <div className="relative w-full h-full">
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      {/* Cup body */}
                      <path 
                        d="M40,60 Q40,160 100,160 Q160,160 160,60" 
                        fill="none" 
                        stroke="#D4C4A8" 
                        strokeWidth="3"
                      />
                      {/* Cup rim */}
                      <ellipse cx="100" cy="60" rx="60" ry="15" fill="none" stroke="#D4C4A8" strokeWidth="3" />
                      {/* Tea liquid */}
                      <ellipse 
                        cx="100" 
                        cy="65" 
                        rx={50 + selectedIngredients.length * 2} 
                        ry={12 + selectedIngredients.length * 0.5} 
                        fill={getBlendColor()}
                        opacity="0.8"
                      />
                      {/* Handle */}
                      <path 
                        d="M160,80 Q190,80 190,110 Q190,140 160,140" 
                        fill="none" 
                        stroke="#D4C4A8" 
                        strokeWidth="3"
                      />
                    </svg>
                    
                    {/* Floating ingredients around cup */}
                    {selectedIngredients.slice(0, 5).map((ing, i) => (
                      <div 
                        key={ing.id}
                        className="absolute w-6 h-6 rounded-full animation-float"
                        style={{
                          backgroundColor: ing.color,
                          top: `${20 + (i * 25)}%`,
                          left: i % 2 === 0 ? '-15%' : '105%',
                          animationDelay: `${i * 0.3}s`
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Selected Ingredients List */}
                <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
                  {selectedIngredients.length === 0 ? (
                    <p className="text-center text-[var(--sage-deep)]/40 text-sm py-4">
                      Sélectionnez vos ingrédients pour commencer
                    </p>
                  ) : (
                    selectedIngredients.map(ing => (
                      <div 
                        key={ing.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-[var(--cream-apothecary)]"
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: ing.color }}
                          />
                          <span className="text-sm text-[var(--sage-deep)]">{ing.name}</span>
                        </div>
                        <button 
                          onClick={() => removeIngredient(ing.id)}
                          className="p-1 hover:bg-red-100 rounded transition-colors"
                        >
                          <Minus className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Price & Actions */}
                <div className="border-t border-[#E5E0D5] pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-[var(--sage-deep)]/60">Prix total</span>
                    <span className="font-display text-2xl text-[var(--gold-antique)]">
                      {totalPrice.toFixed(2)} €
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setShowSummary(true)}
                      disabled={!canFinalize}
                      className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Finaliser</span>
                    </button>
                    <button 
                      onClick={() => { setBlendName(''); }}
                      className="p-3 border border-[#E5E0D5] rounded hover:bg-[var(--cream-apothecary)] transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-[var(--sage-deep)]" />
                    </button>
                  </div>
                  
                  {!canFinalize && selectedIngredients.length > 0 && (
                    <p className="text-xs text-center text-amber-600 mt-2">
                      {!hasBase ? 'Ajoutez une base de thé' : 'Ajoutez au moins un ingrédient'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Ingredient Selection */}
          <div className="lg:col-span-3">
            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {categories.map(cat => {
                const Icon = iconMap[cat.icon];
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-300 ${
                      activeCategory === cat.id
                        ? 'bg-[var(--sage-deep)] text-white'
                        : 'bg-white text-[var(--sage-deep)] hover:bg-[var(--cream-apothecary)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{cat.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Category Description */}
            {currentCategory && (
              <div className="mb-6 p-4 bg-white/60 rounded-xl">
                <p className="text-[var(--sage-deep)]/70 text-sm">
                  {currentCategory.description}
                </p>
              </div>
            )}

            {/* Ingredients Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {categoryIngredients.map(ingredient => {
                const isSelected = isIngredientSelected(ingredient.id);
                return (
                  <button
                    key={ingredient.id}
                    onClick={() => handleIngredientClick(ingredient)}
                    disabled={!isSelected && !canAddMore}
                    className={`relative group text-left p-4 rounded-2xl transition-all duration-300 ${
                      isSelected
                        ? 'bg-white border-2 border-[var(--gold-antique)] shadow-lg'
                        : canAddMore
                        ? 'bg-white border-2 border-transparent hover:border-[var(--gold-antique)]/50 hover:shadow-md'
                        : 'bg-gray-100 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    {/* Selection Check */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-[var(--gold-antique)] rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}

                    {/* Image */}
                    <div 
                      className="w-full aspect-square rounded-xl mb-3 overflow-hidden"
                      style={{ backgroundColor: ingredient.color + '20' }}
                    >
                      <img 
                        src={ingredient.image}
                        alt={ingredient.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    {/* Info */}
                    <h4 className="font-medium text-[var(--sage-deep)] text-sm mb-1">
                      {ingredient.name}
                    </h4>
                    <p className="text-xs text-[var(--sage-deep)]/50 line-clamp-2">
                      {ingredient.description}
                    </p>

                    {/* Intensity Dots */}
                    <div className="flex gap-1 mt-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div 
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            i < ingredient.intensity
                              ? 'bg-[var(--gold-antique)]'
                              : 'bg-[#E5E0D5]'
                          }`}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-2xl text-[var(--sage-deep)] mb-2 text-center">
              Nommez Votre Création
            </h3>
            <p className="text-center text-[var(--sage-deep)]/60 text-sm mb-6">
              Donnez une identité à votre mélange. Il mérite un nom aussi unique que sa composition.
            </p>

            <input
              type="text"
              value={blendName}
              onChange={(e) => setBlendName(e.target.value)}
              placeholder="Ex: Mon Éveil Matinal"
              className="input-elegant w-full mb-6"
            />

            {/* Recipe Summary */}
            <div className="bg-[var(--cream-apothecary)] rounded-2xl p-6 mb-6">
              <h4 className="font-medium text-[var(--sage-deep)] mb-4">Votre Recette</h4>
              <div className="space-y-2">
                {selectedIngredients.map(ing => (
                  <div key={ing.id} className="flex items-center gap-2 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: ing.color }}
                    />
                    <span className="text-[var(--sage-deep)]">{ing.name}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#E5E0D5] mt-4 pt-4 flex justify-between">
                <span className="text-[var(--sage-deep)]/60">Total</span>
                <span className="font-display text-xl text-[var(--gold-antique)]">
                  {totalPrice.toFixed(2)} €
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button 
                onClick={() => setShowSummary(false)}
                className="flex-1 btn-secondary"
              >
                Modifier
              </button>
              <button 
                onClick={() => {
                  alert(`Votre création "${blendName || 'Mon Mélange'}" a été ajoutée au panier !`);
                  setShowSummary(false);
                }}
                disabled={!blendName.trim()}
                className="flex-1 btn-primary disabled:opacity-50"
              >
                Ajouter au Panier
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
