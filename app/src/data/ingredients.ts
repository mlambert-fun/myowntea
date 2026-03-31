import { t } from "@/lib/i18n";
export interface Ingredient {
    id: string;
    name: string;
    category: 'base' | 'flower' | 'fruit' | 'vegetal' | 'aroma';
    description: string;
    benefits: string[];
    intensity: 1 | 2 | 3 | 4 | 5;
    color: string;
    image: string;
    basePrice?: number;
    dayMoments?: string[] | null;
    infusionTime?: string | null;
    dosage?: string | null;
    temperature?: string | null;
    preparation?: string | null;
    origin?: string | null;
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
        description: t("app.data.ingredients.choisissez_fondement_blend"),
        icon: 'Leaf'
    },
    {
        id: 'flower',
        name: 'Fleurs',
        description: t("app.data.ingredients.touche_florale_delicate"),
        icon: 'Flower'
    },
    {
        id: 'fruit',
        name: 'Fruits',
        description: t("app.data.ingredients.notes_fruitees_naturellement"),
        icon: 'Apple'
    },
    {
        id: 'vegetal',
        name: 'Plantes',
        description: t("app.data.ingredients.vertus_naturelles_plantes"),
        icon: 'Sprout'
    },
    {
        id: 'aroma',
        name: t("app.data.ingredients.aromes_naturels"),
        description: t("app.data.ingredients.finalisez_notes_parfumees"),
        icon: 'Sparkles'
    }
];
export const ingredients: Ingredient[] = [
    // Bases
    {
        id: 'green-tea',
        name: t("app.data.ingredients.tea_vert_sencha"),
        category: 'base',
        description: t("app.data.ingredients.tea_vert_japonais"),
        benefits: ['Antioxydant', t("app.data.ingredients.energie_douce"), t("app.data.ingredients.metabolisme")],
        intensity: 3,
        color: '#7C9A6B',
        image: 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=400&h=400&fit=crop'
    },
    {
        id: 'black-tea',
        name: t("app.data.ingredients.tea_noir_assam"),
        category: 'base',
        description: t("app.data.ingredients.tea_noir_corse"),
        benefits: [t("app.data.ingredients.energie"), 'Concentration', t("app.data.ingredients.reveil")],
        intensity: 4,
        color: '#8B4513',
        image: 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=400&h=400&fit=crop'
    },
    {
        id: 'white-tea',
        name: t("app.data.ingredients.tea_blanc_pai"),
        category: 'base',
        description: t("app.data.ingredients.delicat_teas_notes"),
        benefits: [t("app.data.ingredients.detox"), 'Peau', 'Apaisement'],
        intensity: 1,
        color: '#E8DCC8',
        image: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400&h=400&fit=crop'
    },
    {
        id: 'oolong',
        name: 'Oolong Tie Guan Yin',
        category: 'base',
        description: t("app.data.ingredients.tea_semi_oxyde"),
        benefits: ['Digestion', t("app.data.ingredients.bien"), t("app.data.ingredients.equilibre")],
        intensity: 3,
        color: '#C4A77D',
        image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&h=400&fit=crop'
    },
    {
        id: 'rooibos',
        name: 'Rooibos Nature',
        category: 'base',
        description: t("app.data.ingredients.rooibos_sud_africain"),
        benefits: [t("app.data.ingredients.theine"), 'Antioxydant', 'Sommeil'],
        intensity: 2,
        color: '#B87333',
        image: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=400&h=400&fit=crop'
    },
    {
        id: 'mate',
        name: t("app.data.ingredients.mate_vert"),
        category: 'base',
        description: t("app.data.ingredients.mate_argentin_notes"),
        benefits: [t("app.data.ingredients.energie_durable"), 'Mental', 'Social'],
        intensity: 4,
        color: '#4A6741',
        image: 'https://images.unsplash.com/photo-1563822249548-9a72b6353cd1?w=400&h=400&fit=crop'
    },
    // Fleurs
    {
        id: 'rose',
        name: t("app.data.ingredients.rose_damas"),
        category: 'flower',
        description: t("app.data.ingredients.petales_rose_notes"),
        benefits: ['Apaisement', 'Peau', 'Romantisme'],
        intensity: 2,
        color: '#E8B4B8',
        image: 'https://images.unsplash.com/photo-1559563362-c667ba5f5480?w=400&h=400&fit=crop'
    },
    {
        id: 'lavender',
        name: 'Lavande Fine',
        category: 'flower',
        description: t("app.data.ingredients.fleurs_lavande_provencale"),
        benefits: ['Relaxation', 'Sommeil', 'Stress'],
        intensity: 3,
        color: '#B8A9C9',
        image: 'https://images.unsplash.com/photo-1498579687545-d5a4fffb0b0b?w=400&h=400&fit=crop'
    },
    {
        id: 'chamomile',
        name: 'Camomille Romaine',
        category: 'flower',
        description: t("app.data.ingredients.fleurs_camomille_douces"),
        benefits: ['Sommeil', 'Digestion', 'Calme'],
        intensity: 1,
        color: '#F5E6A3',
        image: 'https://images.unsplash.com/photo-1603655261572-c29889d363b4?w=400&h=400&fit=crop'
    },
    {
        id: 'hibiscus',
        name: 'Hibiscus Sabdariffa',
        category: 'flower',
        description: t("app.data.ingredients.fleurs_hibiscus_acidulees"),
        benefits: [t("app.data.ingredients.vitamine"), t("app.data.ingredients.refreshing"), 'Tonus'],
        intensity: 4,
        color: '#C41E3A',
        image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&h=400&fit=crop'
    },
    {
        id: 'jasmine',
        name: 'Jasmin Sambac',
        category: 'flower',
        description: t("app.data.ingredients.fleurs_jasmin_parfumees"),
        benefits: [t("app.data.ingredients.bien"), 'Apaisement', t("app.data.ingredients.serenite")],
        intensity: 3,
        color: '#F8F4E6',
        image: 'https://images.unsplash.com/photo-1590727146287-8c0d12e9f8d6?w=400&h=400&fit=crop'
    },
    {
        id: 'cornflower',
        name: t("app.data.ingredients.bleuet_champs"),
        category: 'flower',
        description: t("app.data.ingredients.fleurs_bleues_delicates"),
        benefits: ['Yeux', 'Confort', t("app.data.ingredients.detente")],
        intensity: 1,
        color: '#6495ED',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop'
    },
    // Fruits
    {
        id: 'strawberry',
        name: t("app.data.ingredients.fraise_bois"),
        category: 'fruit',
        description: t("app.data.ingredients.morceaux_fraise_sucres"),
        benefits: [t("app.data.ingredients.vitamine"), 'Gourmand', 'Plaisir'],
        intensity: 3,
        color: '#FF6B6B',
        image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&h=400&fit=crop'
    },
    {
        id: 'raspberry',
        name: 'Framboise Sauvage',
        category: 'fruit',
        description: t("app.data.ingredients.framboises_acidulees_fruitees"),
        benefits: ['Antioxydant', t("app.data.ingredients.fraicheur"), t("app.data.ingredients.vitalite")],
        intensity: 3,
        color: '#E30B5D',
        image: 'https://images.unsplash.com/photo-1577069861033-55d04cec4ef5?w=400&h=400&fit=crop'
    },
    {
        id: 'lemon',
        name: t("app.data.ingredients.citron_menton"),
        category: 'fruit',
        description: t("app.data.ingredients.zeste_citron_fees"),
        benefits: ['Tonus', t("app.data.ingredients.vitamine_2"), t("app.data.ingredients.refreshing")],
        intensity: 4,
        color: '#FFF44F',
        image: 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=400&h=400&fit=crop'
    },
    {
        id: 'orange',
        name: 'Orange Sanguine',
        category: 'fruit',
        description: t("app.data.ingredients.ecorces_orange_douces"),
        benefits: ['Moral', 'Digestion', t("app.data.ingredients.energie")],
        intensity: 2,
        color: '#FF7F50',
        image: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=400&h=400&fit=crop'
    },
    {
        id: 'apple',
        name: 'Pomme Granny',
        category: 'fruit',
        description: t("app.data.ingredients.morceaux_pomme_croquants"),
        benefits: ['Confort', 'Douceur', 'Familial'],
        intensity: 2,
        color: '#90EE90',
        image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&h=400&fit=crop'
    },
    {
        id: 'peach',
        name: t("app.data.ingredients.peche_blanche"),
        category: 'fruit',
        description: t("app.data.ingredients.peche_juteuse_delicatement"),
        benefits: ['Douceur', 'Gourmandise', 'Plaisir'],
        intensity: 2,
        color: '#FFDAB9',
        image: 'https://images.unsplash.com/photo-1629753250291-979952613877?w=400&h=400&fit=crop'
    },
    {
        id: 'mango',
        name: 'Mangue Alphonso',
        category: 'fruit',
        description: t("app.data.ingredients.mangue_exotique_notes"),
        benefits: ['Exotisme', t("app.data.ingredients.vitamine"), t("app.data.ingredients.evasion")],
        intensity: 3,
        color: '#F4A460',
        image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&h=400&fit=crop'
    },
    {
        id: 'blueberry',
        name: 'Myrtille Sauvage',
        category: 'fruit',
        description: t("app.data.ingredients.myrtilles_sauvages_notes"),
        benefits: ['Antioxydant', t("app.data.ingredients.memoire"), t("app.data.ingredients.sante")],
        intensity: 2,
        color: '#4A0080',
        image: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=400&h=400&fit=crop'
    },
    // Plantes
    {
        id: 'mint',
        name: t("app.data.ingredients.menthe_poivree"),
        category: 'vegetal',
        description: t("app.data.ingredients.feuilles_menthe_fraiche"),
        benefits: ['Digestion', t("app.data.ingredients.fraicheur"), t("app.data.ingredients.vivacite")],
        intensity: 4,
        color: '#98FB98',
        image: 'https://images.unsplash.com/photo-1628556270448-4d4e6a4d57c1?w=400&h=400&fit=crop'
    },
    {
        id: 'verbena',
        name: 'Verveine Odorante',
        category: 'vegetal',
        description: t("app.data.ingredients.verveine_citronnee_apaisante"),
        benefits: ['Relaxation', 'Digestion', 'Sommeil'],
        intensity: 2,
        color: '#9DC183',
        image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
    },
    {
        id: 'ginger',
        name: 'Gingembre Frais',
        category: 'vegetal',
        description: t("app.data.ingredients.racine_gingembre_piquante"),
        benefits: [t("app.data.ingredients.energie"), t("app.data.ingredients.immunite"), 'Chaleur'],
        intensity: 5,
        color: '#D2691E',
        image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&h=400&fit=crop'
    },
    {
        id: 'lemongrass',
        name: 'Citronnelle',
        category: 'vegetal',
        description: t("app.data.ingredients.herbe_citronnee_rafraichissante"),
        benefits: ['Digestion', t("app.data.ingredients.detox"), t("app.data.ingredients.fraicheur")],
        intensity: 3,
        color: '#9ACD32',
        image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
    },
    {
        id: 'cinnamon',
        name: 'Cannelle Ceylan',
        category: 'vegetal',
        description: t("app.data.ingredients.ecorce_cannelle_chaude"),
        benefits: ['Chaleur', 'Confort', 'Gourmandise'],
        intensity: 4,
        color: '#8B4513',
        image: 'https://images.unsplash.com/photo-1556682851-c4580670110f?w=400&h=400&fit=crop'
    },
    {
        id: 'licorice',
        name: t("app.data.ingredients.reglisse_douce"),
        category: 'vegetal',
        description: t("app.data.ingredients.racine_reglisse_sucree"),
        benefits: ['Gorge', 'Douceur', 'Confort'],
        intensity: 3,
        color: '#3D2817',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop'
    },
    {
        id: 'sage',
        name: 'Sauge Officinale',
        category: 'vegetal',
        description: t("app.data.ingredients.feuilles_sauge_vertus"),
        benefits: [t("app.data.ingredients.memoire"), 'Concentration', t("app.data.ingredients.clarte")],
        intensity: 3,
        color: '#8F9779',
        image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
    },
    {
        id: 'thyme',
        name: 'Thym Commun',
        category: 'vegetal',
        description: t("app.data.ingredients.thym_aromatic_proprietes"),
        benefits: [t("app.data.ingredients.immunite"), 'Respiration', 'Force'],
        intensity: 4,
        color: '#6B8E23',
        image: 'https://images.unsplash.com/photo-1605112442948-25e15fbdd29d?w=400&h=400&fit=crop'
    },
    // Arômes
    {
        id: 'vanilla',
        name: 'Vanille Bourbon',
        category: 'aroma',
        description: t("app.data.ingredients.gousse_vanille_sucree"),
        benefits: ['Confort', 'Gourmandise', 'Apaisement'],
        intensity: 2,
        color: '#F3E5AB',
        image: 'https://images.unsplash.com/photo-1626805816859-f1cb3393893e?w=400&h=400&fit=crop'
    },
    {
        id: 'bergamot',
        name: t("app.data.ingredients.bergamote_calabre"),
        category: 'aroma',
        description: 'Agrume italien aux notes florales',
        benefits: [t("app.data.ingredients.equilibre"), t("app.data.ingredients.bien"), t("app.data.ingredients.elegance")],
        intensity: 3,
        color: '#9ACD32',
        image: 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=400&h=400&fit=crop'
    },
    {
        id: 'caramel',
        name: t("app.data.ingredients.caramel_beurre_sale"),
        category: 'aroma',
        description: t("app.data.ingredients.notes_gourmandes_caramel"),
        benefits: ['Plaisir', t("app.data.ingredients.reconfort"), 'Indulgence'],
        intensity: 3,
        color: '#C68E17',
        image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&h=400&fit=crop'
    },
    {
        id: 'honey',
        name: t("app.data.ingredients.miel_lavande"),
        category: 'aroma',
        description: t("app.data.ingredients.miel_floral_doux"),
        benefits: ['Douceur', 'Apaisement', t("app.data.ingredients.bien")],
        intensity: 2,
        color: '#E4A010',
        image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&h=400&fit=crop'
    },
    {
        id: 'almond',
        name: 'Amande Douce',
        category: 'aroma',
        description: t("app.data.ingredients.notes_amande_cremeuse"),
        benefits: ['Confort', 'Douceur', 'Gourmandise'],
        intensity: 2,
        color: '#E8C4A2',
        image: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=400&h=400&fit=crop'
    },
    {
        id: 'coconut',
        name: t("app.data.ingredients.noix_coco"),
        category: 'aroma',
        description: t("app.data.ingredients.notes_exotiques_coco"),
        benefits: [t("app.data.ingredients.evasion"), 'Douceur', 'Exotisme'],
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

