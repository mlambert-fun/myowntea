export interface Ingredient {
  id: string;
  name: string;
  category: 'base' | 'flower' | 'fruit' | 'plant' | 'aroma';
  description: string;
  benefits: string[];
  intensity: 1 | 2 | 3 | 4 | 5;
  color: string;
  image: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const categories: Category[] = [
  {
    id: 'base',
    name: 'Bases',
    description: 'Choisissez votre fondement — le cœur de votre création',
    icon: 'Leaf'
  },
  {
    id: 'flower',
    name: 'Fleurs',
    description: 'Une touche florale délicate et poétique',
    icon: 'Flower'
  },
  {
    id: 'fruit',
    name: 'Fruits',
    description: 'Des notes fruitées naturellement sucrées',
    icon: 'Apple'
  },
  {
    id: 'plant',
    name: 'Plantes & Herbes',
    description: 'Les vertus naturelles des plantes médicinales',
    icon: 'Sprout'
  },
  {
    id: 'aroma',
    name: 'Arômes',
    description: 'Finalisez avec des notes parfumées uniques',
    icon: 'Sparkles'
  }
];

export const ingredients: Ingredient[] = [
  // Bases
  {
    id: 'green-tea',
    name: 'Thé Vert Sencha',
    category: 'base',
    description: 'Thé vert japonais délicat aux notes végétales fraîches',
    benefits: ['Antioxydant', 'Énergie douce', 'Métabolisme'],
    intensity: 3,
    color: '#7C9A6B',
    image: 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=400&h=400&fit=crop'
  },
  {
    id: 'black-tea',
    name: 'Thé Noir Assam',
    category: 'base',
    description: 'Thé noir corsé aux notes maltées et caramel',
    benefits: ['Énergie', 'Concentration', 'Réveil'],
    intensity: 4,
    color: '#8B4513',
    image: 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=400&h=400&fit=crop'
  },
  {
    id: 'white-tea',
    name: 'Thé Blanc Pai Mu Tan',
    category: 'base',
    description: 'Le plus délicat des thés, aux notes florales subtiles',
    benefits: ['Détox', 'Peau', 'Apaisement'],
    intensity: 1,
    color: '#E8DCC8',
    image: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400&h=400&fit=crop'
  },
  {
    id: 'oolong',
    name: 'Oolong Tie Guan Yin',
    category: 'base',
    description: 'Thé semi-oxydé aux notes orchidées et beurre',
    benefits: ['Digestion', 'Bien-être', 'Équilibre'],
    intensity: 3,
    color: '#C4A77D',
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&h=400&fit=crop'
  },
  {
    id: 'rooibos',
    name: 'Rooibos Nature',
    category: 'base',
    description: 'Rooibos sud-africain sans théine, doux et sucré',
    benefits: ['Sans théine', 'Antioxydant', 'Sommeil'],
    intensity: 2,
    color: '#B87333',
    image: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=400&h=400&fit=crop'
  },
  {
    id: 'mate',
    name: 'Maté Vert',
    category: 'base',
    description: 'Maté argentin aux notes herbacées et légèrement amères',
    benefits: ['Énergie durable', 'Mental', 'Social'],
    intensity: 4,
    color: '#4A6741',
    image: 'https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?w=400&h=400&fit=crop'
  },

  // Fleurs
  {
    id: 'rose',
    name: 'Rose de Damas',
    category: 'flower',
    description: 'Pétales de rose aux notes délicates et apaisantes',
    benefits: ['Apaisement', 'Peau', 'Romantisme'],
    intensity: 2,
    color: '#E8B4B8',
    image: 'https://images.unsplash.com/photo-1559563362-c667ba5f5480?w=400&h=400&fit=crop'
  },
  {
    id: 'lavender',
    name: 'Lavande Fine',
    category: 'flower',
    description: 'Fleurs de lavande provençale aux vertus relaxantes',
    benefits: ['Relaxation', 'Sommeil', 'Stress'],
    intensity: 3,
    color: '#B8A9C9',
    image: 'https://images.unsplash.com/photo-1498579687545-d5a4fffb0b0b?w=400&h=400&fit=crop'
  },
  {
    id: 'chamomile',
    name: 'Camomille Romaine',
    category: 'flower',
    description: 'Fleurs de camomille douces et apaisantes',
    benefits: ['Sommeil', 'Digestion', 'Calme'],
    intensity: 1,
    color: '#F5E6A3',
    image: 'https://images.unsplash.com/photo-1603655261572-c29889d363b4?w=400&h=400&fit=crop'
  },
  {
    id: 'hibiscus',
    name: 'Hibiscus Sabdariffa',
    category: 'flower',
    description: 'Fleurs d\'hibiscus acidulées et rafraîchissantes',
    benefits: ['Vitaminé', 'Rafraîchissant', 'Tonus'],
    intensity: 4,
    color: '#C41E3A',
    image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&h=400&fit=crop'
  },
  {
    id: 'jasmine',
    name: 'Jasmin Sambac',
    category: 'flower',
    description: 'Fleurs de jasmin parfumées et enivrantes',
    benefits: ['Bien-être', 'Apaisement', 'Sérénité'],
    intensity: 3,
    color: '#F8F4E6',
    image: 'https://images.unsplash.com/photo-1590727146287-8c0d12e9f8d6?w=400&h=400&fit=crop'
  },
  {
    id: 'cornflower',
    name: 'Bleuet des Champs',
    category: 'flower',
    description: 'Fleurs bleues délicates aux vertus apaisantes',
    benefits: ['Yeux', 'Confort', 'Détente'],
    intensity: 1,
    color: '#6495ED',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop'
  },

  // Fruits
  {
    id: 'strawberry',
    name: 'Fraise des Bois',
    category: 'fruit',
    description: 'Morceaux de fraise sucrés et parfumés',
    benefits: ['Vitaminé', 'Gourmand', 'Plaisir'],
    intensity: 3,
    color: '#FF6B6B',
    image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&h=400&fit=crop'
  },
  {
    id: 'raspberry',
    name: 'Framboise Sauvage',
    category: 'fruit',
    description: 'Framboises acidulées et fruitées',
    benefits: ['Antioxydant', 'Fraîcheur', 'Vitalité'],
    intensity: 3,
    color: '#E30B5D',
    image: 'https://images.unsplash.com/photo-1577069861033-55d04cec4ef5?w=400&h=400&fit=crop'
  },
  {
    id: 'lemon',
    name: 'Citron de Menton',
    category: 'fruit',
    description: 'Zeste de citron frais et tonifiant',
    benefits: ['Tonus', 'Vitaminé C', 'Rafraîchissant'],
    intensity: 4,
    color: '#FFF44F',
    image: 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=400&h=400&fit=crop'
  },
  {
    id: 'orange',
    name: 'Orange Sanguine',
    category: 'fruit',
    description: 'Écorces d\'orange douces et parfumées',
    benefits: ['Moral', 'Digestion', 'Énergie'],
    intensity: 2,
    color: '#FF7F50',
    image: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=400&h=400&fit=crop'
  },
  {
    id: 'apple',
    name: 'Pomme Granny',
    category: 'fruit',
    description: 'Morceaux de pomme croquants et sucrés',
    benefits: ['Confort', 'Douceur', 'Familial'],
    intensity: 2,
    color: '#90EE90',
    image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&h=400&fit=crop'
  },
  {
    id: 'peach',
    name: 'Pêche Blanche',
    category: 'fruit',
    description: 'Pêche juteuse et délicatement sucrée',
    benefits: ['Douceur', 'Gourmandise', 'Plaisir'],
    intensity: 2,
    color: '#FFDAB9',
    image: 'https://images.unsplash.com/photo-1629753250291-979952613877?w=400&h=400&fit=crop'
  },
  {
    id: 'mango',
    name: 'Mangue Alphonso',
    category: 'fruit',
    description: 'Mangue exotique aux notes sucrées et crémeuses',
    benefits: ['Exotisme', 'Vitaminé', 'Évasion'],
    intensity: 3,
    color: '#F4A460',
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&h=400&fit=crop'
  },
  {
    id: 'blueberry',
    name: 'Myrtille Sauvage',
    category: 'fruit',
    description: 'Myrtilles sauvages aux notes boisées',
    benefits: ['Antioxydant', 'Mémoire', 'Santé'],
    intensity: 2,
    color: '#4A0080',
    image: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=400&h=400&fit=crop'
  },

  // Plantes & Herbes
  {
    id: 'mint',
    name: 'Menthe Poivrée',
    category: 'plant',
    description: 'Feuilles de menthe fraîche et intense',
    benefits: ['Digestion', 'Fraîcheur', 'Vivacité'],
    intensity: 4,
    color: '#98FB98',
    image: 'https://images.unsplash.com/photo-1628556270448-4d4e6a4d57c1?w=400&h=400&fit=crop'
  },
  {
    id: 'verbena',
    name: 'Verveine Odorante',
    category: 'plant',
    description: 'Verveine citronnée et apaisante',
    benefits: ['Relaxation', 'Digestion', 'Sommeil'],
    intensity: 2,
    color: '#9DC183',
    image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
  },
  {
    id: 'ginger',
    name: 'Gingembre Frais',
    category: 'plant',
    description: 'Racine de gingembre piquante et tonifiante',
    benefits: ['Énergie', 'Immunité', 'Chaleur'],
    intensity: 5,
    color: '#D2691E',
    image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&h=400&fit=crop'
  },
  {
    id: 'lemongrass',
    name: 'Citronnelle',
    category: 'plant',
    description: 'Herbe citronnée rafraîchissante',
    benefits: ['Digestion', 'Détox', 'Fraîcheur'],
    intensity: 3,
    color: '#9ACD32',
    image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
  },
  {
    id: 'cinnamon',
    name: 'Cannelle Ceylan',
    category: 'plant',
    description: 'Écorce de cannelle chaude et épicée',
    benefits: ['Chaleur', 'Confort', 'Gourmandise'],
    intensity: 4,
    color: '#8B4513',
    image: 'https://images.unsplash.com/photo-1556682851-c4580670110f?w=400&h=400&fit=crop'
  },
  {
    id: 'licorice',
    name: 'Réglisse Douce',
    category: 'plant',
    description: 'Racine de réglisse sucrée et caractéristique',
    benefits: ['Gorge', 'Douceur', 'Confort'],
    intensity: 3,
    color: '#3D2817',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop'
  },
  {
    id: 'sage',
    name: 'Sauge Officinale',
    category: 'plant',
    description: 'Feuilles de sauge aux vertus purifiantes',
    benefits: ['Mémoire', 'Concentration', 'Clarté'],
    intensity: 3,
    color: '#8F9779',
    image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
  },
  {
    id: 'thyme',
    name: 'Thym Commun',
    category: 'plant',
    description: 'Thym aromatique aux propriétés antiseptiques',
    benefits: ['Immunité', 'Respiration', 'Force'],
    intensity: 4,
    color: '#6B8E23',
    image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
  },

  // Arômes
  {
    id: 'vanilla',
    name: 'Vanille Bourbon',
    category: 'aroma',
    description: 'Gousse de vanille sucrée et crémeuse',
    benefits: ['Confort', 'Gourmandise', 'Apaisement'],
    intensity: 2,
    color: '#F3E5AB',
    image: 'https://images.unsplash.com/photo-1626805816859-f1cb3393893e?w=400&h=400&fit=crop'
  },
  {
    id: 'bergamot',
    name: 'Bergamote de Calabre',
    category: 'aroma',
    description: 'Agrume italien aux notes florales',
    benefits: ['Équilibre', 'Bien-être', 'Élégance'],
    intensity: 3,
    color: '#9ACD32',
    image: 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=400&h=400&fit=crop'
  },
  {
    id: 'caramel',
    name: 'Caramel Beurre Salé',
    category: 'aroma',
    description: 'Notes gourmandes de caramel fondant',
    benefits: ['Plaisir', 'Réconfort', 'Indulgence'],
    intensity: 3,
    color: '#C68E17',
    image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&h=400&fit=crop'
  },
  {
    id: 'honey',
    name: 'Miel de Lavande',
    category: 'aroma',
    description: 'Miel floral doux et naturel',
    benefits: ['Douceur', 'Apaisement', 'Bien-être'],
    intensity: 2,
    color: '#E4A010',
    image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&h=400&fit=crop'
  },
  {
    id: 'almond',
    name: 'Amande Douce',
    category: 'aroma',
    description: 'Notes d\'amande crémeuse et réconfortante',
    benefits: ['Confort', 'Douceur', 'Gourmandise'],
    intensity: 2,
    color: '#E8C4A2',
    image: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=400&h=400&fit=crop'
  },
  {
    id: 'coconut',
    name: 'Noix de Coco',
    category: 'aroma',
    description: 'Notes exotiques de coco crémeuse',
    benefits: ['Évasion', 'Douceur', 'Exotisme'],
    intensity: 2,
    color: '#FFF8E7',
    image: 'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?w=400&h=400&fit=crop'
  }
];

export const getIngredientsByCategory = (categoryId: string): Ingredient[] => {
  return ingredients.filter(ing => ing.category === categoryId);
};

export const getIngredientById = (id: string): Ingredient | undefined => {
  return ingredients.find(ing => ing.id === id);
};
