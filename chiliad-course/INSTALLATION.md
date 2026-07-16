# Installation — Course de Caisses à Savon du Mont Chiliad

Site d'inscriptions et de gestion de courses chronométrées.
Mairie de San Andréas.

**Stack :** front statique (GitHub Pages) + Supabase (Postgres, Auth, Realtime).
Aucun serveur à maintenir, aucune facture.

---

## 1. Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → **New project**
2. Renseigner :
   - **Name** : `chiliad-course`
   - **Database Password** : générer et **le noter dans un gestionnaire de mots de passe**. Il ne sert pas au site, uniquement à un accès direct à la base. Il n'est plus jamais affiché.
   - **Region** : `West EU (Ireland)` — la plus proche.
3. **Create new project**, puis patienter ~2 minutes.

Le plan gratuit couvre très largement l'événement : 500 Mo de base, 200 connexions temps réel simultanées, 2 millions de messages Realtime par mois.

---

## 2. Exécuter les scripts

Dans Supabase → **SQL Editor** → **New query**.

Coller et exécuter les trois fichiers **dans cet ordre**, un par un :

| Ordre | Fichier | Contenu |
|---|---|---|
| 1 | `sql/01_schema.sql` | Tables, vues de classement, triggers, temps réel |
| 2 | `sql/02_rls.sql` | Sécurité : rôles, permissions, verrou de publication |
| 3 | `sql/03_seed.sql` | Données de démonstration |

Chaque script doit répondre **Success. No rows returned**. Si une erreur apparaît, ne pas lancer le suivant — le corriger d'abord.

**Vérification :** onglet **Table Editor**, tu dois voir 7 tables (`profils`, `entreprises`, `inscriptions`, `courses`, `participants`, `resultats`, `historique`) et `courses` doit contenir 6 lignes.

---

## 3. Créer le compte administrateur

Les comptes ne se créent pas en SQL : Supabase Auth doit chiffrer le mot de passe lui-même.

1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Renseigner :
   - **Email** : `admin@mairiesanandreas.fr`
   - **Password** : un mot de passe fort, différent de celui de la base
   - Cocher **Auto Confirm User** ← sans ça, le compte reste bloqué en attente d'un email de confirmation
3. **Create user**

Le trigger `handle_new_user()` crée automatiquement le profil, avec le rôle **opérateur** par défaut. Il faut donc le promouvoir.

**SQL Editor** → nouvelle requête :

```sql
update profils
set role = 'admin', nom = 'Math Baticorte'
where email = 'admin@mairiesanandreas.fr';
```

**Vérifier** — la requête doit renvoyer exactement une ligne avec `role = admin` :

```sql
select email, nom, role, actif from profils;
```

### Comptes opérateur

Même procédure (Add user + Auto Confirm), sans l'`update`. Ils sont opérateurs d'office.

Prévois-en un par personne qui saisira les temps le soir de la course. Chaque action est tracée nominativement dans l'historique — un compte partagé rend ce journal inutile.

**Compte de démonstration à créer pour tester :**

| Email | Rôle |
|---|---|
| `admin@mairiesanandreas.fr` | Administrateur |
| `operateur@mairiesanandreas.fr` | Opérateur |

---

## 4. Récupérer les clés de configuration

**Project Settings** → **API**. Deux valeurs à relever :

| Nom dans Supabase | Où elle va |
|---|---|
| **Project URL** | `https://xxxxxxxxxxxx.supabase.co` |
| **anon / public key** | longue chaîne commençant par `eyJ...` |

Elles iront dans `assets/config.js` (fourni à l'étape suivante) :

```js
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

### Pourquoi ces clés sont dans un fichier public

C'est déroutant, mais c'est correct : la clé `anon` est **conçue pour être publique**. Elle ne donne aucun droit par elle-même. Tout ce qu'un visiteur peut faire avec, ce sont les policies RLS de `02_rls.sql` qui le décident — c'est-à-dire : lire le programme et déposer une inscription. Rien d'autre.

Un test concret, une fois le site en ligne : ouvre la console du navigateur et essaie de lire les inscriptions avec la clé anon. Tu obtiendras une liste vide. Pas une erreur — une liste vide. Postgres filtre les lignes avant qu'elles ne sortent.

> ⚠️ **La clé à ne jamais publier est la `service_role`.** Celle-là contourne RLS et donne un accès total. Elle n'est utilisée nulle part dans ce projet. Si elle apparaît un jour dans un fichier du dépôt, il faut la révoquer immédiatement (**Settings → API → Reset**).

---

## 5. Réinitialiser avant l'événement

Les données de démonstration doivent disparaître avant l'ouverture des vraies inscriptions.

```sql
-- Vide inscriptions, courses, participants, resultats et l'historique.
-- Conserve les entreprises et les comptes.
truncate inscriptions, courses, historique restart identity cascade;
```

`courses` emporte `participants` et `resultats` en cascade — inutile de les citer.

Pour repartir vraiment de zéro, ajouter `entreprises` à la liste.

---

## 6. Suite

- **Étape 2** — design system + site public (inscriptions, courses, classements)
- **Étape 3** — panel administrateur
- **Étape 4** — écran géant + mise en production GitHub Pages

---

## Dépannage

**« relation "profils" does not exist »**
`01_schema.sql` n'a pas été exécuté, ou il s'est arrêté sur une erreur. Le relancer et lire le message en entier.

**« type "role_utilisateur" already exists »**
Le script a déjà tourné. Pour repartir proprement :
```sql
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
```
Puis relancer les trois fichiers. ⚠️ Cela efface **tout**.

**Un compte se connecte mais ne voit rien**
Son profil est absent ou inactif. Vérifier :
```sql
select p.email, p.role, p.actif from profils p;
```
Si la ligne manque, le trigger `on_auth_user_created` n'a pas tourné (utilisateur créé avant `01_schema.sql`). L'insérer à la main :
```sql
insert into profils (id, email, nom, role)
select id, email, split_part(email, '@', 1), 'operateur'
from auth.users
where id not in (select id from profils);
```

**Le temps réel ne remonte rien**
Vérifier que les tables sont bien publiées :
```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime';
```
Cinq lignes attendues : `courses`, `participants`, `resultats`, `inscriptions`, `entreprises`.
