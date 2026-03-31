import fs from 'node:fs';
import path from 'node:path';
import ts from '../app/node_modules/typescript/lib/typescript.js';
import { readUtf8Text, writeUtf8Json } from './i18n-utf8.mjs';

const ROOT = process.cwd();
const SCAN_DIRS = ['app/src', 'admin/src', 'backend/src'];
const OUTPUT_FILE = path.join(ROOT, 'locales', 'fr.json');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.vite']);

const ACCENT_RE = /[àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]/;
const FRENCH_WORD_RE = /\b(le|la|les|de|des|du|et|ou|pour|avec|sans|vous|votre|vos|mon|ma|mes|commande|panier|compte|livraison|adresse|email|mot|passe|inscription|connexion|deconnexion|déconnexion|retour|ajouter|modifier|supprimer|creation|création|ingredient|ingrédient|the|thé|melange|mélange|francais|français|belgique|france|gratuit|gratuitement|sécurisé|paiement)\b/i;

const FR_STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'd', 'et', 'ou', 'a', 'au', 'aux', 'en', 'sur', 'pour', 'par', 'avec',
  'sans', 'dans', 'ce', 'cet', 'cette', 'ces', 'se', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'votre',
  'vos', 'notre', 'nos', 'l', 'est', 'sont', 'etre', 'etre', 'plus', 'moins', 'tres', 'trop', 'via', 'depuis', 'vers', 'etat'
]);

const EN_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'from', 'with', 'without', 'in', 'on', 'of', 'at', 'is', 'are', 'be', 'by'
]);

const TOKEN_TRANSLATIONS = {
  afficher: 'display',
  masquer: 'hide',
  deconnecter: 'logout',
  deconnexion: 'logout',
  se: null,
  filtres: 'filters',
  filtre: 'filter',
  remboursee: 'refunded',
  remboursee: 'refunded',
  rembourse: 'refund',
  rembourser: 'refund',
  creer: 'create',
  creez: 'create',
  deplier: 'expand',
  plier: 'collapse',
  menu: 'menu',
  derniere: 'last',
  dernieres: 'latest',
  derniers: 'latest',
  latest: 'latest',
  actuelle: 'current',
  actualisation: 'refresh',
  actualiser: 'refresh',
  mise: 'update',
  jour: 'day',
  maj: 'update',
  prochaine: 'next',
  execution: 'execution',
  executions: 'executions',
  frequence: 'frequency',
  min: 'min',
  surveillance: 'monitoring',
  parametrage: 'setup',
  taches: 'tasks',
  tache: 'task',
  gestion: 'management',
  gerez: 'manage',
  historique: 'history',
  relance: 'followup',
  relances: 'followups',
  kpi: 'kpi',
  fichier: 'file',
  selectionne: 'selected',
  selectionnee: 'selected',
  selectionnes: 'selected',
  selectionnez: 'select',
  veuillez: 'please',
  list: 'list',
  liste: 'list',
  dossier: 'record',
  statuts: 'statuses',
  status: 'status',
  colonnes: 'columns',
  colonne: 'column',
  points: 'points',
  creation: 'blend',
  creations: 'blends',
  blend: 'blend',
  blends: 'blends',
  editez: 'edit',
  editer: 'edit',
  modifie: 'updated',
  modifiee: 'updated',
  modifiees: 'updated',
  modification: 'edit',
  commande: 'order',
  commandes: 'orders',
  preparations: 'preparations',
  preparation: 'preparation',
  confirmee: 'confirmed',
  annulee: 'canceled',
  expediee: 'shipped',
  livree: 'delivered',
  panier: 'cart',
  paniers: 'carts',
  caddie: 'cart',
  compte: 'account',
  comptes: 'accounts',
  invite: 'guest',
  invites: 'guests',
  livraison: 'shipping',
  livraisons: 'shipping',
  expeditions: 'shipments',
  expedition: 'shipment',
  suivi: 'tracking',
  suivii: 'tracking',
  transporteur: 'carrier',
  colis: 'parcel',
  adresse: 'address',
  adresses: 'addresses',
  facturation: 'billing',
  domicile: 'home',
  relais: 'point',
  point: 'pickup',
  postal: 'postal',
  ville: 'city',
  pays: 'country',
  code: 'code',
  thes: 'teas',
  the: 'tea',
  ligne: 'online',
  fr: 'fr',
  france: 'france',
  metropolitaine: 'metropolitan',
  mode: 'mode',
  choix: 'choice',
  disponibles: 'available',
  disponible: 'available',
  country: 'country',
  ingredient: 'ingredient',
  ingredients: 'ingredients',
  saveur: 'flavor',
  saveurs: 'flavors',
  bienfaits: 'benefits',
  dosage: 'dosage',
  temperature: 'temperature',
  infuser: 'brew',
  infusion: 'infusion',
  moment: 'moment',
  journee: 'daytime',
  texture: 'texture',
  epaisseur: 'body',
  sucrosite: 'sweetness',
  intensite: 'intensity',
  profil: 'profile',
  aromatique: 'aromatic',
  vegetal: 'herbal',
  fruit: 'fruity',
  acidule: 'tangy',
  citronne: 'citrus',
  rafraichissant: 'refreshing',
  epic: 'spicy',
  epice: 'spicy',
  douceur: 'softness',
  veloute: 'velvety',
  puissant: 'strong',
  marque: 'bold',
  leger: 'light',
  dense: 'dense',
  ajout: 'add',
  ajouter: 'add',
  ajoutez: 'add',
  supprime: 'delete',
  supprimer: 'delete',
  modifier: 'edit',
  annuler: 'cancel',
  annule: 'canceled',
  annules: 'canceled',
  active: 'active',
  actif: 'active',
  actifs: 'active',
  inactif: 'inactive',
  inactifs: 'inactive',
  paiement: 'payment',
  payer: 'pay',
  prix: 'price',
  total: 'total',
  taxe: 'tax',
  securise: 'secure',
  securisee: 'secure',
  email: 'email',
  mot: 'password',
  passe: 'password',
  connexion: 'login',
  inscrire: 'register',
  inscription: 'signup',
  erreur: 'error',
  impossible: 'failed',
  echec: 'failure',
  introuvable: 'not_found',
  invalide: 'invalid',
  vide: 'empty',
  aucun: 'none',
  aucune: 'none',
  nouvelle: 'new',
  nouveau: 'new',
  trouver: 'find',
  trouvere: 'found',
  trouveres: 'found',
  charge: 'load',
  charger: 'load',
  chargement: 'loading',
  reduction: 'discount',
  reductions: 'discounts',
  promo: 'promo',
  parametres: 'settings',
  boutique: 'store',
  options: 'options',
  option: 'option',
  statut: 'status',
  defaut: 'default',
  type: 'type',
  categories: 'categories',
  categorie: 'category',
  quantite: 'quantity',
  priorite: 'priority',
  date: 'date',
  periode: 'period',
  validite: 'validity',
  premiere: 'first',
  uniquement: 'only',
  tous: 'all',
  toutes: 'all',
  all: 'all',
  du: null,
  au: null,
  et: null,
  ou: null,
  pour: null,
  avec: null,
  sans: null,
  des: null,
  les: null,
  vos: null,
  votre: null,
  mon: 'my',
  ma: 'my',
  mes: 'my',
  langue: 'language',
  francais: 'french',
  belgique: 'belgium',
  english: 'english',
  retour: 'back',
  accueil: 'home',
  voir: 'view',
  recherche: 'search',
  details: 'details',
  detail: 'details',
  configurez: 'configure',
  regles: 'rules',
  limites: 'limits',
  utilisation: 'usage',
  gerez: 'manage',
  valeur: 'value',
  valeurs: 'values',
  variantes: 'variants',
  produits: 'products',
  produit: 'product',
  produits: 'products',
  variante: 'variant',
  variantes: 'variants',
  value: 'value',
  values: 'values',
  pack: 'pack',
  packs: 'packs',
  puis: 'then',
  moments: 'moments',
  appliquees: 'applied',
  newsletter: 'newsletter',
  enregistrer: 'save',
  lancer: 'run',
  prochain: 'next',
  precedent: 'prev',
  precedente: 'prev',
  suivant: 'next',
  preced: 'prev',
  precedent: 'prev',
  precedents: 'prev',
  veuille: 'please',
  veuillez: 'please',
  cree: 'created',
  creee: 'created',
  creees: 'created',
  clients: 'customers',
  client: 'customer',
  traiter: 'process',
  traite: 'process',
  traites: 'processed',
  dashboard: 'dashboard',
  tableau: 'dashboard',
  bord: 'dashboard',
  alertes: 'alerts',
  alerte: 'alert',
  operationnelles: 'operational',
  operationnelle: 'operational',
  chiffre: 'revenue',
  affaires: 'revenue',
  mois: 'month',
  metriques: 'metrics',
  metrique: 'metric',
  resumee: 'summary',
  resume: 'summary',
  recapitulatif: 'summary',
  recapitulatif: 'summary',
  recapitulatifs: 'summaries',
  etiquette: 'label',
  telecharger: 'download',
  telechargement: 'download',
  telecharge: 'download',
  desactiver: 'disable',
  reactiver: 'enable',
  reset: 'reset',
  reinitialiser: 'reset',
  csv: 'csv',
  supporte: 'supported',
  telephone: 'phone',
  prenom: 'first_name',
  nom: 'last_name',
  civilite: 'title',
  compte: 'account',
  comptes: 'accounts',
  relances: 'reminders',
  rappels: 'reminders',
  marketing: 'marketing',
  valide: 'valid',
  valides: 'valid',
  requis: 'required',
  impossible: 'failed',
  bienvenue: 'welcome',
  contact: 'contact',
  support: 'support',
  details: 'details',
  detail: 'details',
  instruction: 'instruction',
  speciale: 'special',
  speciales: 'special',
  continuez: 'continue',
  continuer: 'continue',
  google: 'google',
  recette: 'recipe',
  recettes: 'recipes',
  communaute: 'community',
  offres: 'offers',
  newsletter: 'newsletter',
  confidentialite: 'privacy',
  conditions: 'terms',
  generales: 'general',
  commande: 'order',
  commandes: 'orders',
  expeditions: 'shipments',
  expeditionss: 'shipments',
  expedier: 'ship',
  expedie: 'shipped',
  livree: 'delivered',
  expediee: 'shipped',
  annulee: 'canceled',
  remboursee: 'refunded',
  remboursee: 'refunded',
  rembourseee: 'refunded',
  ete: 'summer',
  hiver: 'winter',
  printemps: 'spring',
  automne: 'autumn',
  retour: 'back',
  accueil: 'home',
  voir: 'view',
  afficher: 'display',
  masquer: 'hide',
  filtres: 'filters',
  filtre: 'filter',
  etat: 'status',
  statut: 'status',
  prix: 'price',
  total: 'total',
  gratuite: 'free',
  gratuit: 'free',
  gratuitee: 'free',
  paiements: 'payments',
  paiement: 'payment',
  methode: 'method',
  moyen: 'method',
  detaille: 'detailed',
  medetaille: 'detailed_method',
  imprimez: 'print',
  imprimer: 'print',
  facture: 'invoice',
  facturation: 'billing',
  shipping: 'shipping',
  livraison: 'shipping',
  frais: 'fees',
  port: 'shipping',
  adresse: 'address',
  adresses: 'addresses',
  pays: 'country',
  langue: 'locale',
  francais: 'french',
  english: 'english',
  belgique: 'belgium',
  france: 'france',
  maintenance: 'maintenance',
  redirection: 'redirect',
  redirections: 'redirects',
  regles: 'rules',
  regle: 'rule',
  test: 'test',
  tester: 'test',
  cible: 'target',
  ciblees: 'targeted',
  fenetre: 'window',
  debut: 'start',
  fin: 'end',
  priorite: 'priority',
  active: 'active',
  inactif: 'inactive',
  inactifs: 'inactive',
  doit: 'must',
  nombre: 'number',
  action: 'action',
  supprimera: 'delete',
  cas: 'case',
  anomalie: 'issue',
  objet: 'subject',
  recommande: 'recommended',
  nommez: 'name',
  merci: 'please',
  renseigner: 'enter',
  selectionner: 'select',
  lien: 'link',
  all: 'all',
  invalid: 'invalid',
};

const PHRASE_KEY_OVERRIDES = [
  [/^créé le$/i, 'created_at'],
  [/^ma création$/i, 'my_blend'],
  [/^paiement sécurisé$/i, 'secure_payment'],
  [/^voir les commandes$/i, 'view_orders'],
  [/^voir les expéditions$/i, 'view_shipments'],
  [/^voir les emails$/i, 'view_emails'],
  [/^voir les jobs$/i, 'view_jobs'],
  [/^remboursée$/i, 'refunded'],
  [/^afficher les filtres$/i, 'display_filters'],
  [/^ou$/i, 'or'],
  [/^et$/i, 'and'],
  [/^à traiter$/i, 'to_process'],
  [/^tableau de bord$/i, 'dashboard'],
  [/^récapitulatif$/i, 'summary'],
  [/^état$/i, 'status'],
  [/^désactiver$/i, 'disable'],
  [/^étiquette$/i, 'label'],
  [/^réinitialiser$/i, 'reset'],
  [/^télécharger$/i, 'download'],
  [/^continuer avec google$/i, 'continue_with_google'],
];

const MOJIBAKE_REPLACEMENTS = [
  ['â€™', '’'], ['â€˜', '‘'], ['â€œ', '“'], ['â€', '”'],
  ['â€“', '–'], ['â€”', '—'], ['â€¦', '…'], ['â€¢', '•'],
  ['Â ', ' '], ['Â°', '°'], ['Â€', '€'], ['â‚¬', '€'],
  ['Ã©', 'é'], ['Ã¨', 'è'], ['Ãª', 'ê'], ['Ã«', 'ë'],
  ['Ã ', 'à'], ['Ã¢', 'â'], ['Ã¤', 'ä'], ['Ã¹', 'ù'],
  ['Ã»', 'û'], ['Ã¼', 'ü'], ['Ã´', 'ô'], ['Ã¶', 'ö'],
  ['Ã®', 'î'], ['Ã¯', 'ï'], ['Ã§', 'ç'], ['Å“', 'œ'],
  ['Ã‰', 'É'], ['Ã€', 'À'], ['Ã‡', 'Ç'],
  ['â‰ˆ', '≈'],
];

const QUESTION_FIXES = [
  [/Cr\?\? le/gi, 'Créé le'],
  [/Ma cr\?ation/gi, 'Ma création'],
  [/cr\?ation/gi, 'création'],
  [/ingr\?dient/gi, 'ingrédient'],
  [/Ingr\?dient/gi, 'Ingrédient'],
  [/d\?faut/gi, 'défaut'],
  [/^\?chec/gi, 'Échec'],
  [/succ\?s/gi, 'succès'],
  [/R\?essayez/gi, 'Réessayez'],
  [/r\?cup\?rer/gi, 'récupérer'],
  [/Mise \? jour/gi, 'Mise à jour'],
  [/mis \? jour/gi, 'mis à jour'],
  [/Livraison \? domicile/gi, 'Livraison à domicile'],
  [/Rafra\?chissement/gi, 'Rafraîchissement'],
  [/r\?duction/gi, 'réduction'],
  [/P\?riode/gi, 'Période'],
  [/Premi\?re/gi, 'Première'],
  [/d\?autres/gi, 'd’autres'],
  [/\?tre/gi, 'être'],
  [/enregistree/gi, 'enregistrée'],
  [/Cr\?\?e/gi, 'Créée'],
  [/Cr\?e/gi, 'Créé'],
  [/exp\?ditions/gi, 'expéditions'],
  [/s\?lectionn/gi, 'sélectionn'],
  [/d\?faut/gi, 'défaut'],
  [/re\?u/gi, 'reçu'],
  [/a\?ro/gi, 'aéro'],
  [/G\?rez/gi, 'Gérez'],
  [/D\?tails/gi, 'Détails'],
  [/appliqu\?es/gi, 'appliquées'],
  [/d\?utilisation/gi, 'd’utilisation'],
  [/r\?gles/gi, 'règles'],
  [/validit\?$/gi, 'validité'],
];

const TECHNICAL_VALUE_PATTERNS = [
  /\bCREATE\s+INDEX\b/i,
  /\bSELECT\b.+\bFROM\b/i,
  /\bopenid email profile\b/i,
  /^ORD-[A-Z0-9-]+$/i,
  /^mot-locale-market-updated$/i,
  /\bcreatedFromOrderId\b/i,
  /\bEmailConsentEvent_email_createdAt_idx\b/i,
];

const ENGLISH_VALUE_REPLACEMENTS = new Map([
  ['Failed to fetch email metrics', 'Impossible de récupérer les métriques email'],
  ['Failed to fetch email deliveries', 'Impossible de récupérer les envois d’emails'],
  ['Failed to fetch email preferences', 'Impossible de récupérer les préférences email'],
  ['Failed to resend email', 'Impossible de renvoyer l’email'],
  ['Failed to send test email', 'Impossible d’envoyer l’email de test'],
  ['Failed to delete ingredient', 'Impossible de supprimer l’ingrédient'],
  ['Failed to save ingredient', 'Impossible d’enregistrer l’ingrédient'],
  ['Failed to create ingredient', 'Impossible de créer l’ingrédient'],
  ['Failed to fetch ingredient', 'Impossible de récupérer l’ingrédient'],
  ['Failed to update ingredient', 'Impossible de mettre à jour l’ingrédient'],
  ['Failed to update email', 'Impossible de mettre à jour l’email'],
  ['Failed to update email preferences', 'Impossible de mettre à jour les préférences email'],
  ['Ingredient deleted', 'Ingrédient supprimé'],
  ['Email and password required', 'Email et mot de passe requis'],
  ['Email is required', 'Email requis'],
  ['Error retrying email delivery:', 'Erreur lors de la relance d’envoi de l’email :'],
  ['Error sending admin test email:', 'Erreur lors de l’envoi de l’email de test admin :'],
  ['Error fetching email deliveries:', 'Erreur lors de la récupération des envois d’emails :'],
  ['Error fetching email metrics:', 'Erreur lors de la récupération des métriques email :'],
  ['Error fetching ingredient:', 'Erreur lors de la récupération de l’ingrédient :'],
  ['Error creating ingredient:', 'Erreur lors de la création de l’ingrédient :'],
  ['Error deleting ingredient:', 'Erreur lors de la suppression de l’ingrédient :'],
  ['Error updating ingredient:', 'Erreur lors de la mise à jour de l’ingrédient :'],
  ['Ingredient identifiers are required', 'Les identifiants d’ingrédients sont requis'],
  ['Ingredient identifiers are required for blend cart items.', 'Les identifiants d’ingrédients sont requis pour les articles création du panier.'],
  ['Ingredient not found', 'Ingrédient introuvable'],
  ['Valid "to" email is required', 'Une adresse email destinataire valide est requise'],
  ['Email delivery not found', 'Envoi d’email introuvable'],
  ['Password reset email error:', 'Erreur d’email de réinitialisation du mot de passe :'],
  ['Test Ingredient', 'Ingrédient de test'],
  ['Displays the mobile sidebar.', 'Affiche la barre latérale mobile.'],
]);

function replaceEnglishPhrases(text) {
  if (!text) return text;

  const normalized = normalizeWhitespace(String(text));

  if (ENGLISH_VALUE_REPLACEMENTS.has(normalized)) {
    return ENGLISH_VALUE_REPLACEMENTS.get(normalized);
  }

  return normalized
    .replace(/^Failed to fetch email deliveries$/i, 'Impossible de récupérer les envois d’emails')
    .replace(/^Failed to fetch email preferences$/i, 'Impossible de récupérer les préférences email')
    .replace(/^Failed to update email$/i, 'Impossible de mettre à jour l’email')
    .replace(/^Failed to update email preferences$/i, 'Impossible de mettre à jour les préférences email')
    .replace(/^Ingredient not found$/i, 'Ingrédient introuvable')
    .replace(/^Password reset email error:$/i, 'Erreur d’email de réinitialisation du mot de passe :')
    .replace(/blend\/listing/gi, 'création/listing')
    .replace(/template CSV/gi, 'modèle CSV')
    .replace(/\bsale price\b/gi, 'prix promotionnel')
    .replace(/\bfail\/retry\b/gi, 'échec/relance')
    .replace(/\benvoye\b/gi, 'envoyé');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...walk(full));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (CODE_EXTS.has(ext)) files.push(full);
  }
  return files;
}

function normalizeWhitespace(value) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function scoreFrenchQuality(text) {
  const accents = (text.match(ACCENT_RE) || []).length;
  const frenchHints = (text.match(FRENCH_WORD_RE) || []).length;
  const mojibake = (text.match(/[ÃÂâ�]/g) || []).length;
  const weirdQuestions = (text.match(/[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]|\?\?/g) || []).length;
  return accents * 3 + frenchHints * 2 - mojibake * 3 - weirdQuestions * 2;
}

function repairMojibake(text) {
  let result = text;

  for (const [from, to] of MOJIBAKE_REPLACEMENTS) {
    result = result.split(from).join(to);
  }

  if (/[ÃÂâ]/.test(result)) {
    try {
      const latin1Decoded = Buffer.from(result, 'latin1').toString('utf8');
      if (scoreFrenchQuality(latin1Decoded) > scoreFrenchQuality(result)) {
        result = latin1Decoded;
      }
    } catch {
      // ignore
    }
  }

  for (const [pattern, replacement] of QUESTION_FIXES) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

function normalizeCandidate(value) {
  return normalizeWhitespace(replaceEnglishPhrases(repairMojibake(String(value ?? ''))))
    .replace(/^\?\s+/, '');
}

function looksLikeCode(text) {
  if (!text) return true;
  if (text.length > 180) return true;
  if (/[{}]/.test(text)) return true;
  if (/=>|\bfunction\b|\bconst\b|\blet\b|\breturn\b|<\/?[A-Za-z]/.test(text)) return true;
  if ((text.match(/;/g) || []).length >= 2) return true;
  return false;
}

function looksLikeClassList(text) {
  const tokens = text.split(' ').filter(Boolean);
  if (tokens.length < 4) return false;
  const utilityLike = tokens.filter((token) => {
    if (/^(sm|md|lg|xl|2xl):/.test(token)) return true;
    if (/^(w|h|min|max|text|bg|border|rounded|px|py|pt|pb|pl|pr|mt|mb|mx|my|gap|grid|flex|items|justify|font|tracking|object|overflow|shadow|opacity|translate|transition|duration|cursor|inline|block|hidden|z)-/.test(token)) return true;
    if (/[\[\]:/]/.test(token)) return true;
    return false;
  }).length;
  return utilityLike / tokens.length >= 0.6;
}

function shouldKeep(text) {
  if (!text || text.length < 2) return false;
  if (TECHNICAL_VALUE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (looksLikeCode(text)) return false;
  if (looksLikeClassList(text)) return false;
  if (/className=|onClick=|aria-label=/.test(text)) return false;
  if (/^(true|false|null|undefined|NaN)$/i.test(text)) return false;
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(text)) return false;
  if (/^[\w./:@?&=%+#-]+$/.test(text) && !ACCENT_RE.test(text) && !FRENCH_WORD_RE.test(text)) return false;
  if (/^(?:--[\w-]+|var\(--[\w-]+\))$/.test(text)) return false;
  return ACCENT_RE.test(text) || FRENCH_WORD_RE.test(text) || /[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]|\?\?/.test(text);
}

function toAsciiToken(token) {
  return token
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function toUniqueKey(baseKey, usedKeys) {
  if (!usedKeys.has(baseKey)) return baseKey;
  let idx = 2;
  let deduped = `${baseKey}_${idx}`;
  while (usedKeys.has(deduped)) {
    idx += 1;
    deduped = `${baseKey}_${idx}`;
  }
  return deduped;
}

function buildReadableKey(text, usedKeys, sectionKey) {
  for (const [regex, overrideKey] of PHRASE_KEY_OVERRIDES) {
    if (regex.test(text)) {
      return toUniqueKey(overrideKey, usedKeys);
    }
  }

  const rawTokens = (text.match(/[A-Za-zÀ-ÿ0-9]+/g) || []).map(toAsciiToken).filter(Boolean);
  const isFrenchText = ACCENT_RE.test(text) || FRENCH_WORD_RE.test(text);
  const translated = rawTokens
    .map((token) => {
      const mapped = TOKEN_TRANSLATIONS[token];
      if (mapped === null) return null;
      if (mapped) return mapped;
      if (EN_STOPWORDS.has(token) || FR_STOPWORDS.has(token)) return null;
      if (!isFrenchText && /^[a-z][a-z0-9]*$/.test(token)) return token;
      if (/^[a-z][a-z0-9]{2,}$/.test(token)) return token;
      return null;
    })
    .filter((token) => token && !EN_STOPWORDS.has(token));

  const dedupedTranslated = [];
  for (const token of translated) {
    if (!dedupedTranslated.includes(token)) dedupedTranslated.push(token);
  }

  let chosen = dedupedTranslated.slice(0, 3);
  if (chosen.length === 0) {
    const sectionTail = sectionKey.split('.').pop() || 'section';
    const sectionToken = toAsciiToken(sectionTail) || 'section';
    chosen = [sectionToken, 'label'];
  }

  let key = chosen.join('_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return toUniqueKey(key, usedKeys);
}

function getScriptKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function shouldSkipStringNode(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  if (ts.isExternalModuleReference(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isShorthandPropertyAssignment(p)) return true;
  if (ts.isEnumMember(p) && p.name === node) return true;
  return false;
}

function toSectionKey(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const parts = normalized.split('/');

  let project = 'shared';
  let idx = 0;
  if (parts[0] === 'app' || parts[0] === 'admin' || parts[0] === 'backend') {
    project = parts[0];
    idx = parts[1] === 'src' ? 2 : 1;
  }

  const rest = parts.slice(idx);
  const file = rest.pop() || 'unknown.ts';
  const fileBase = file.replace(/\.(tsx?|jsx?)$/i, '');

  const groupParts = [project, ...rest, fileBase]
    .map((part) => part
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    )
    .filter(Boolean);

  return groupParts.join('.');
}

const stringsByFile = new Map();

for (const dir of SCAN_DIRS) {
  const absDir = path.join(ROOT, dir);
  if (!fs.existsSync(absDir)) continue;
  const files = walk(absDir);

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const source = readUtf8Text(file);
    const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, getScriptKind(file));

    const fileStrings = stringsByFile.get(rel) || new Set();

    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (!shouldSkipStringNode(node)) {
          const text = normalizeCandidate(node.text);
          if (shouldKeep(text)) fileStrings.add(text);
        }
      } else if (ts.isJsxText(node)) {
        const text = normalizeCandidate(node.getText(sf));
        if (shouldKeep(text)) fileStrings.add(text);
      }
      ts.forEachChild(node, visit);
    };

    visit(sf);
    if (fileStrings.size > 0) stringsByFile.set(rel, fileStrings);
  }
}

const sections = {};
let totalStrings = 0;

for (const rel of [...stringsByFile.keys()].sort((a, b) => a.localeCompare(b))) {
  const sectionKey = toSectionKey(rel);
  const texts = [...stringsByFile.get(rel)].sort((a, b) => a.localeCompare(b, 'fr'));

  const entries = { _source: rel };
  const usedKeys = new Set();

  for (const text of texts) {
    const key = buildReadableKey(text, usedKeys, sectionKey);
    usedKeys.add(key);
    entries[key] = text;
    totalStrings += 1;
  }

  sections[sectionKey] = entries;
}

const payload = {
  _meta: {
    generatedAt: new Date().toISOString(),
    sourceDirectories: SCAN_DIRS,
    grouping: 'by_file_page_or_section',
    keyStyle: 'readable_english_1_to_3_words',
    totalGroups: Object.keys(sections).length,
    totalStrings,
    note: 'Extraction automatique des textes français en dur (candidats) avec correction mojibake.',
  },
  sections,
};

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
writeUtf8Json(OUTPUT_FILE, payload);

console.log(`Generated ${path.relative(ROOT, OUTPUT_FILE)} with ${totalStrings} strings in ${Object.keys(sections).length} groups.`);
