# My Own Tea - Backend API

Ecommerce backend pour My Own Tea avec authentification, gestion des commandes, ingrédients, et intégrations de paiement/livraison.

## Stack Technique

- **Node.js** + **Express** (serveur API)
- **TypeScript** (typage strict)
- **Prisma** (ORM + migrations)
- **PostgreSQL** (base de données)
- **JWT** (authentification sécurisée)
- **bcryptjs** (hashage des mots de passe)

## Architecture

```
backend/
├── src/
│   ├── index.ts                    # Serveur Express principal
│   ├── routes/
│   │   ├── auth.ts                 # Auth: register, login
│   │   ├── ingredients.ts          # CRUD ingrédients (public + admin)
│   │   ├── orders.ts               # Gestion des commandes
│   │   └── admin.ts                # Config paiement/livraison
│   ├── middleware/
│   │   ├── auth.ts                 # Vérification JWT + roles
│   │   └── errorHandler.ts         # Gestion des erreurs
│   └── utils/
│       ├── prisma.ts               # Client Prisma singleton
│       ├── auth.ts                 # Génération/vérification JWT
│       └── password.ts             # Hashage/comparaison mots de passe
├── prisma/
│   └── schema.prisma               # Schéma de données complet
├── .env.example                    # Variables d'environnement exemple
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

### 1. Cloner et installer dépendances

```bash
cd backend
npm install
```

### 2. Configurer la base de données

Copier `.env.example` en `.env` et éditer les valeurs :

```bash
cp .env.example .env
```

Éditer `.env` :
```env
DATABASE_URL="postgresql://username:password@localhost:5432/myowntea"
JWT_SECRET="votre-cle-secrete-tres-longue"
JWT_EXPIRY="7d"
PORT=5000
WEB_BASE_URL="http://localhost:5173"
```

### 3. Initialiser la base de données

```bash
# Générer le client Prisma
npm run prisma:generate

# Créer la base et appliquer migrations
npm run prisma:migrate
```

### 4. Lancer le serveur

**Mode développement :**
```bash
npm run dev
```

**Mode production :**
```bash
npm run build
npm run start
```

## API Endpoints

### Auth

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/auth/register` | Créer un compte client | ❌ |
| POST | `/api/auth/login` | Se connecter | ❌ |
| GET | `/api/auth/me` | Récupérer mon profil | ✅ |

### Ingrédients

| Méthode | Endpoint | Description | Auth | Role |
|---------|----------|-------------|------|------|
| GET | `/api/ingredients` | Lister tous les ingrédients | ❌ | - |
| GET | `/api/ingredients/:id` | Détail d'un ingrédient | ❌ | - |
| POST | `/api/ingredients` | Créer un ingrédient | ✅ | ADMIN |
| PUT | `/api/ingredients/:id` | Modifier un ingrédient | ✅ | ADMIN |
| DELETE | `/api/ingredients/:id` | Supprimer un ingrédient | ✅ | ADMIN |

### Commandes

| Méthode | Endpoint | Description | Auth | Role |
|---------|----------|-------------|------|------|
| GET | `/api/orders` | Mes commandes (ou toutes si admin) | ✅ | ADMIN/CUSTOMER |
| POST | `/api/orders` | Créer une commande | ✅ | CUSTOMER |
| GET | `/api/orders/:id` | Détail d'une commande | ✅ | ADMIN/OWNER |
| PATCH | `/api/orders/:id/status` | Changer le statut | ✅ | ADMIN |

### Admin (Paiement & Livraison)

| Méthode | Endpoint | Description | Auth | Role |
|---------|----------|-------------|------|------|
| GET | `/api/admin/payment-providers` | Lister les fournisseurs de paiement | ✅ | ADMIN |
| POST | `/api/admin/payment-providers` | Ajouter un fournisseur de paiement | ✅ | ADMIN |
| PUT | `/api/admin/payment-providers/:id` | Modifier un fournisseur de paiement | ✅ | ADMIN |
| GET | `/api/admin/shipping-providers` | Lister les fournisseurs de livraison | ✅ | ADMIN |
| POST | `/api/admin/shipping-providers` | Ajouter un fournisseur de livraison | ✅ | ADMIN |
| PUT | `/api/admin/shipping-providers/:id` | Modifier un fournisseur de livraison | ✅ | ADMIN |

## Exemples d'Utilisation

### Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "SecurePassword123!",
    "firstName": "Alice",
    "lastName": "Dupont"
  }'
```

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "SecurePassword123!"
  }'
```

Réponse :
```json
{
  "user": { "id": "cuid123...", "email": "alice@example.com", "role": "CUSTOMER" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Créer un ingrédient (Admin)

```bash
curl -X POST http://localhost:5000/api/ingredients \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Menthe fraîche",
    "description": "Menthe bio verte, goût frais et vivifiant",
    "category": "flavor",
    "image": "https://example.com/mint.jpg",
    "color": "#7C9A6B",
    "intensity": 4,
    "benefits": ["Digestion", "Fraîcheur"],
    "price": 2.50,
    "stock": 50
  }'
```

### Créer une commande

```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "items": [
      { "ingredientId": "ing_id_1", "quantity": 2 },
      { "ingredientId": "ing_id_2", "quantity": 1 }
    ],
    "shippingAddress": "123 Rue de Paris, 75001 Paris",
    "comment": "Livrer avant 18h s'il vous plaît"
  }'
```

## Modèle de Données

### User (Utilisateur)
- `id` (cuid) - Identifiant unique
- `email` (string, unique) - Email
- `passwordHash` (string) - Mot de passe hashé
- `role` (ADMIN | CUSTOMER | GUEST)
- Relations : customer, orders

### Customer (Profil Client)
- `id` (cuid)
- `userId` (string, unique) - Référence à User
- `firstName`, `lastName`, `phone`, `address`, `city`, `postalCode`, `country`

### Ingredient (Ingrédient)
- `id` (cuid)
- `name` (string, unique) - Nom du thé
- `description` (text)
- `category` (string) - "base", "flavor", "flower", etc.
- `color` (string) - Couleur hex pour l'UI
- `intensity` (int 1-5) - Force du goût
- `benefits` (string[]) - Bienfaits
- `price` (float) - Prix unitaire
- `stock` (int) - Quantité en stock
- `isActive` (boolean)

### Order (Commande)
- `id` (cuid)
- `orderNumber` (string, unique) - Numéro lisible (ORD-123456)
- `status` (PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | REFUNDED)
- `subtotal`, `tax`, `shippingCost`, `total` (float)
- `comment` (text) - Commentaires spéciaux client
- `shippingAddress` (text)
- `trackingNumber` (string)
- `paymentStatus` (pending | completed | failed)
- Relations : customer, user, items (OrderItem[]), payment (Payment)

### OrderItem (Ligne de Commande)
- `id` (cuid)
- `orderId` - Référence Order
- `ingredientId` - Référence Ingredient
- `quantity` (int)
- `price` (float) - Prix au moment de la commande

### PaymentProvider
- `id` (cuid)
- `name` (string) - "Stripe", "PayPal"
- `config` (json) - Clés API, webhooks, etc.
- `isActive` (boolean)

### ShippingProvider
- `id` (cuid)
- `name` (string) - "Colissimo", "DHL"
- `config` (json) - Tarifs, zones, API, etc.
- `isActive` (boolean)

## Sécurité

- ✅ Authentification JWT
- ✅ Hashage bcrypt des mots de passe
- ✅ CORS configuré
- ✅ Validation basique des entrées
- ⚠️ **À faire** : 
  - Validation/sanitization avancée
  - Rate limiting
  - Chiffrement des données sensibles (API keys)
  - HTTPS en production
  - Logs d'audit complets

## Prochaines Étapes

1. **Admin Dashboard** : Créer une interface React pour l'administration
2. **Payment Integration** : Intégrer Stripe/PayPal
3. **Shipping Integration** : Intégrer Colissimo/DHL
4. **Email Notifications** : Envoi d'emails de confirmation
5. **Analytics** : Tableaux de bord statistiques
6. **Tests** : Tests unitaires et intégration (Jest, Supertest)
7. **Déploiement** : Railway, Vercel, Heroku, etc.

## Support

Pour des questions, consultez la [documentation Prisma](https://www.prisma.io/docs) et [Express](https://expressjs.com).

## Backup Railway via script

1. Set `RAILWAY_DATABASE_URL` in `backend/.env` (recommended).  
   Fallback is `DATABASE_URL` if `RAILWAY_DATABASE_URL` is missing.
2. Run:

```bash
npm run db:backup:railway
```

The script creates a dump file in `backend/backups/` using `pg_dump`.
If `pg_dump` is missing, it tries `docker` with `postgres:16`.
