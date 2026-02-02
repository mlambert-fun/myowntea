import { useState, useRef } from 'react';
import { ingredients, categories } from '@/data/ingredients';
import { Search, X, Heart, Info } from 'lucide-react';

export function IngredientsGallery() {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIngredient, setSelectedIngredient] = useState<typeof ingredients[0] | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const sectionRef = useRef<HTMLDivElement>(null);

  const filteredIngredients = ingredients.filter(ing => {
    const matchesCategory = activeFilter ? ing.category === activeFilter : true;
    const matchesSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ing.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(id)) {
        newFavorites.delete(id);
      } else {
        newFavorites.add(id);
      }
      return newFavorites;
    });
  };

  return (
    <section 
      ref={sectionRef}
      className="relative w-full bg-[#F5F1E8] py-20"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block text-sm uppercase tracking-[3px] text-[var(--gold-antique)] font-medium mb-4">
            Notre Collection
          </span>
          <h2 className="font-display text-4xl md:text-5xl text-[var(--sage-deep)] mb-4">
            Les <span className="italic">Trésors</span> Botaniques
          </h2>
          <p className="text-[var(--sage-deep)]/60 max-w-xl mx-auto">
            Découvrez notre sélection d'ingrédients soigneusement sourcés, 
            cultivés avec amour et respect de la nature.
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-10">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--sage-deep)]/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un ingrédient..."
              className="input-elegant w-full pl-12"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-[var(--sage-deep)]/40" />
              </button>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveFilter(null)}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeFilter === null
                  ? 'bg-[var(--sage-deep)] text-white'
                  : 'bg-white text-[var(--sage-deep)] hover:bg-[var(--cream-apothecary)]'
              }`}
            >
              Tous
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveFilter(cat.id)}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                  activeFilter === cat.id
                    ? 'bg-[var(--sage-deep)] text-white'
                    : 'bg-white text-[var(--sage-deep)] hover:bg-[var(--cream-apothecary)]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6 text-sm text-[var(--sage-deep)]/60">
          {filteredIngredients.length} ingrédient{filteredIngredients.length !== 1 ? 's' : ''}
        </div>

        {/* Masonry Grid */}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {filteredIngredients.map((ingredient, index) => (
            <div 
              key={ingredient.id}
              className="break-inside-avoid group"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div 
                className="relative bg-white rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl"
                onClick={() => setSelectedIngredient(ingredient)}
              >
                {/* Image */}
                <div 
                  className="relative aspect-square overflow-hidden"
                  style={{ backgroundColor: ingredient.color + '15' }}
                >
                  <img
                    src={ingredient.image}
                    alt={ingredient.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute bottom-4 left-4 right-4">
                      <button className="w-full py-2 bg-white/90 rounded-lg text-sm font-medium text-[var(--sage-deep)] flex items-center justify-center gap-2">
                        <Info className="w-4 h-4" />
                        Voir détails
                      </button>
                    </div>
                  </div>

                  {/* Favorite Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(ingredient.id);
                    }}
                    className="absolute top-3 right-3 p-2 bg-white/80 rounded-full transition-all duration-300 hover:bg-white"
                  >
                    <Heart 
                      className={`w-4 h-4 transition-colors ${
                        favorites.has(ingredient.id) 
                          ? 'fill-red-500 text-red-500' 
                          : 'text-[var(--sage-deep)]'
                      }`}
                    />
                  </button>

                  {/* Category Badge */}
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-1 bg-white/80 rounded-full text-xs font-medium text-[var(--sage-deep)]">
                      {categories.find(c => c.id === ingredient.category)?.name}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-display text-lg text-[var(--sage-deep)] mb-1">
                    {ingredient.name}
                  </h3>
                  <p className="text-sm text-[var(--sage-deep)]/60 line-clamp-2">
                    {ingredient.description}
                  </p>
                  
                  {/* Benefits */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {ingredient.benefits.slice(0, 2).map(benefit => (
                      <span 
                        key={benefit}
                        className="px-2 py-0.5 bg-[var(--cream-apothecary)] rounded-full text-xs text-[var(--sage-deep)]/70"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredIngredients.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--cream-apothecary)] flex items-center justify-center">
              <Search className="w-8 h-8 text-[var(--sage-deep)]/40" />
            </div>
            <h3 className="font-display text-xl text-[var(--sage-deep)] mb-2">
              Aucun ingrédient trouvé
            </h3>
            <p className="text-[var(--sage-deep)]/60">
              Essayez une autre recherche ou filtre
            </p>
          </div>
        )}
      </div>

      {/* Ingredient Detail Modal */}
      {selectedIngredient && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedIngredient(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="grid md:grid-cols-2">
              {/* Image */}
              <div 
                className="aspect-square md:aspect-auto"
                style={{ backgroundColor: selectedIngredient.color + '20' }}
              >
                <img
                  src={selectedIngredient.image}
                  alt={selectedIngredient.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Content */}
              <div className="p-8">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-sm text-[var(--gold-antique)] font-medium uppercase tracking-wide">
                      {categories.find(c => c.id === selectedIngredient.category)?.name}
                    </span>
                    <h3 className="font-display text-2xl text-[var(--sage-deep)] mt-1">
                      {selectedIngredient.name}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedIngredient(null)}
                    className="p-2 hover:bg-[var(--cream-apothecary)] rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-[var(--sage-deep)]" />
                  </button>
                </div>

                <p className="text-[var(--sage-deep)]/70 mb-6">
                  {selectedIngredient.description}
                </p>

                {/* Intensity */}
                <div className="mb-6">
                  <span className="text-sm text-[var(--sage-deep)]/60 mb-2 block">Intensité</span>
                  <div className="flex gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div 
                        key={i}
                        className={`w-8 h-2 rounded-full ${
                          i < selectedIngredient.intensity
                            ? 'bg-[var(--gold-antique)]'
                            : 'bg-[#E5E0D5]'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Benefits */}
                <div className="mb-6">
                  <span className="text-sm text-[var(--sage-deep)]/60 mb-2 block">Bienfaits</span>
                  <div className="flex flex-wrap gap-2">
                    {selectedIngredient.benefits.map(benefit => (
                      <span 
                        key={benefit}
                        className="px-3 py-1.5 bg-[var(--cream-apothecary)] rounded-full text-sm text-[var(--sage-deep)]"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Action */}
                <button 
                  onClick={() => {
                    const creatorSection = document.getElementById('creator');
                    if (creatorSection) {
                      creatorSection.scrollIntoView({ behavior: 'smooth' });
                      setSelectedIngredient(null);
                    }
                  }}
                  className="w-full btn-primary"
                >
                  Utiliser dans ma création
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
