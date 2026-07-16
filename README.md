# Course de Caisses à Savon du Mont Chiliad

Site d'inscriptions et de gestion de courses chronométrées.
**Mairie de San Andréas** — 1ᵉʳ août 2026, 21h00.

Front statique + Supabase. Aucun serveur à maintenir, aucune facture.

---

## Ce que fait le site

**Public** (`index.html`)
Formulaire d'inscription (solo / duo / entreprise), programme des courses avec statuts
en couleur, classement par course et classement général filtrable. Tout se met à jour
en direct, sans rechargement.

**Organisation** (`admin.html`)
Tableau de bord, inscriptions, courses, participants, saisie et publication des
résultats, classements, historique, paramètres. Deux rôles : administrateur et
opérateur.

**Écran géant** (`live.html`)
Vue plein écran pour projection : course en cours, classement qui se réordonne quand
un temps tombe, prochaine course, suite du programme. Rien à cliquer.

---

## Arborescence

```
chiliad-course/
├── index.html              Site public
├── admin.html              Panel organisation
├── live.html               Écran géant
├── assets/
│   ├── config.js           ← LE SEUL FICHIER À MODIFIER
│   ├── api.js              Client Supabase, chronos, tri, temps réel
│   ├── style.css           Design system partagé
│   ├── admin.css           Styles du panel
│   ├── public.js           Logique du site public
│   ├── admin.js            Logique du panel
│   ├── live.js             Logique de l'écran géant
│   └── logo-msa.png        ← À DÉPOSER (facultatif)
├── sql/
│   ├── 01_schema.sql       Tables, vues, triggers, temps réel
│   ├── 02_rls.sql          Sécurité : rôles et permissions
│   └── 03_seed.sql         Données de démonstration
├── INSTALLATION.md         Mise en place de Supabase, pas à pas
└── README.md
```

---

## Trois choses à savoir

**Le verrou de publication est dans Postgres, pas dans le JavaScript.**
Tant que `resultats_publies` vaut `false`, un visiteur ne reçoit pas les temps —
ni par requête, ni par le WebSocket, ni à travers les vues. Tu peux saisir toute la
soirée sans risque de fuite.

**« Prochaine course » n'est pas un statut stocké.**
C'est la course « à venir » la plus proche dans le temps, recalculée à chaque
affichage. Passe une course en « Terminée » et la suivante prend la main toute seule.

**L'historique est alimenté par des triggers.**
Personne n'a le droit d'y écrire — pas même un administrateur. Il est donc
infalsifiable depuis l'application. Chaque action porte le nom de son auteur : d'où
l'intérêt d'un compte par personne plutôt qu'un compte partagé.

---

## Lancer en local

Les modules ES ne fonctionnent pas en `file://`. Il faut un serveur, même minimal :

```bash
cd chiliad-course
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

Prérequis : Supabase configuré et `assets/config.js` renseigné — voir
[INSTALLATION.md](INSTALLATION.md).

---

## Mettre en production (GitHub Pages)

1. **Créer le dépôt** sur GitHub — par exemple `CourseChiliad`, en public.
   *(GitHub Pages gratuit exige un dépôt public. Ce n'est pas un problème de
   sécurité ici : aucun secret ne se trouve dans le code, tout est verrouillé
   par RLS côté Postgres.)*

2. **Vérifier `assets/config.js`** — `SUPABASE_URL` et `SUPABASE_ANON_KEY` renseignés.
   ⚠️ Ne jamais y mettre la clé `service_role`.

3. **Pousser les fichiers.**
   ```bash
   git init
   git add .
   git commit -m "Site course caisses à savon"
   git branch -M main
   git remote add origin https://github.com/Symea/CourseChiliad.git
   git push -u origin main
   ```
   Ou par glisser-déposer via **Add file → Upload files**.

4. **Activer Pages** — Settings → Pages → Source : `Deploy from a branch`,
   Branch : `main` / `/ (root)` → Save.

5. **Attendre 1 à 2 minutes.** Le site est en ligne sur
   `https://symea.github.io/CourseChiliad/`

6. **Vérifier depuis un téléphone en 4G** (pas en wifi) : c'est le test qui
   attrape les erreurs de config que le cache local masque.

> Le dossier `sql/` peut rester dans le dépôt : ce sont des scripts, pas des secrets.
> Ils ne contiennent aucun mot de passe.

---

## Ordre des choses à faire

### Maintenant — mise en place (~30 min)

1. Créer le projet Supabase → [INSTALLATION.md §1](INSTALLATION.md)
2. Exécuter `01_schema.sql`, `02_rls.sql`, `03_seed.sql` **dans cet ordre** → §2
3. Créer le compte admin + le promouvoir → §3
4. Copier l'URL et la clé anon dans `assets/config.js` → §4
5. Tester en local : `python3 -m http.server 8000`
6. Déposer `assets/logo-msa.png` (le logo MSA que tu as déjà)
7. Renseigner `lienReglement` et `lienDecharge` dans `config.js`
8. Publier sur GitHub Pages

### Test complet (~20 min) — à faire avant d'ouvrir les inscriptions

Le seed est là pour ça : il contient déjà le scénario complet.

- [ ] Déposer une inscription depuis le site public → elle apparaît **seule** dans le panel
- [ ] Ouvrir le panel dans un second onglet → l'inscription arrive **sans rechargement**
- [ ] Saisir un temps sur la Manche Entreprises #1 → **rien** n'apparaît côté public
- [ ] Cliquer **Publier les résultats** → le classement apparaît **instantanément**
- [ ] Ouvrir `live.html` sur un troisième écran → il se réordonne en direct
- [ ] Se connecter avec le compte opérateur → **Paramètres** est absent
- [ ] Depuis la console du navigateur, essayer de lire les inscriptions avec la clé anon
      → **liste vide**, pas une erreur. C'est RLS qui filtre.
- [ ] Tester sur téléphone, en 4G

### Avant l'événement (J-2)

9. **Vider les données de démonstration** :
   ```sql
   truncate inscriptions, courses, historique restart identity cascade;
   ```
10. Créer les vraies entreprises → Paramètres
11. Créer un **compte opérateur par personne** qui saisira les temps
12. Ouvrir les inscriptions (communication)

### Jour J

13. Créer les manches → **Courses**
14. Engager les participants → **Participants** (depuis les inscriptions validées)
15. Attribuer dossards et ordres de départ
16. Imprimer la grille de départ → **Classements → Imprimer**
17. Brancher `live.html` sur l'écran géant, en plein écran (F11)
18. Passer la manche en **En cours** au départ
19. Saisir les temps au fil de l'arrivée — `Entrée` enchaîne sur le suivant
20. Relire, puis **Publier les résultats**
21. Passer la manche en **Terminée** → la suivante devient « prochaine » automatiquement

### Après

22. Exporter les classements en CSV → **Classements → Exporter CSV**
23. Les données restent en ligne : le site reste consultable

---

## Saisie des temps

Formats acceptés — tous convertis en millisecondes :

| Saisie | Interprétation |
|---|---|
| `2:47.320` | 2 min 47 s 320 ms |
| `2:47` | 2 min 47 s |
| `1:02:47.320` | 1 h 2 min 47 s 320 ms |
| `47.5` | 47 s 500 ms |

`Entrée` enregistre et passe au participant suivant. `Échap` annule la saisie en cours.
Chaque champ s'enregistre aussi en le quittant. Vider un champ efface le résultat.

Si ton chronométrage se fait à la seconde, passe `afficherMs` à `false` dans
`config.js` — sinon tous les temps s'affichent avec un `.000` qui fait faux.

---

## Dépannage

**Page blanche**
Ouvrir la console (F12). `Failed to resolve module` → tu as ouvert le fichier en
`file://`. Il faut un serveur : `python3 -m http.server 8000`.

**« Invalid API key »**
`config.js` contient encore `REMPLACER_ICI`, ou la clé a été tronquée à la copie.

**Le temps réel ne remonte rien**
Vérifier la publication des tables → [INSTALLATION.md, Dépannage](INSTALLATION.md).

**Un compte se connecte mais ne voit rien**
Son profil est absent ou inactif → même section.

**Les accents sont cassés dans l'export CSV**
Ouvrir le fichier par Excel → Données → À partir d'un fichier texte, encodage UTF-8.
L'export contient déjà un BOM, ce cas devrait être rare.

---

## Sécurité — ce qui est en place

| | |
|---|---|
| Mots de passe | Chiffrés par Supabase Auth (bcrypt), invisibles partout |
| Routes admin | Session JWT vérifiée + profil actif exigé |
| Rôles | Policies RLS Postgres — pas de JavaScript |
| Injections | Requêtes paramétrées par le client Supabase |
| XSS | Toute donnée affichée passe par `echapper()` |
| Suppressions | Confirmation obligatoire, avec l'impact annoncé |
| Téléphones | Le public peut écrire une inscription, jamais en lire une |
| Résultats | Invisibles tant que non publiés, y compris par WebSocket |
| Audit | Triggers Postgres, en écriture seule pour tous |

Le seul point à surveiller : **ne jamais publier la clé `service_role`**. Elle
contourne RLS. Elle n'est utilisée nulle part dans ce projet.
