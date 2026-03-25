# ZeGoodCorner

Base MVP d'une marketplace avec :

- Frontend React (Vite)
- Backend Node.js/Express
- Base de données MySQL

## 1) Initialiser la base MySQL

1. Crée un fichier `server/.env` à partir de `server/.env.example`.
2. Lance le script SQL :

```bash
mysql -u root -p < server/sql/init.sql
```

Si ton utilisateur MySQL n'est pas `root`, adapte la commande et les variables dans `server/.env`.

Si tu avais déjà lancé une ancienne version de la base, applique aussi la migration :

```bash
mysql -u root -p < server/sql/migrate_add_user_names.sql
```

Puis ajoute les rôles utilisateurs :

```bash
mysql -u root -p < server/sql/migrate_add_user_role.sql
```

## 2) Lancer le backend

```bash
npm --prefix server install
npm --prefix server run dev
```

API disponible sur `http://localhost:4000`.

## 3) Lancer le frontend

1. Crée un fichier `client/.env` à partir de `client/.env.example`.
2. Lance :

```bash
npm --prefix client install
npm --prefix client run dev
```

Frontend disponible sur `http://localhost:5173`.

## Endpoints MVP

- `GET /api/listings/latest`
- `POST /api/auth/register` (champs : `firstName`, `lastName`, `email`, `password`)
- `POST /api/auth/login`

## Rôles utilisateurs

- `acheteur`
- `vendeur`
- `admin`

Par défaut, tout nouveau compte est créé avec le rôle `acheteur`.
