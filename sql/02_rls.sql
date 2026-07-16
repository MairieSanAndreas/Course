-- =====================================================================
--  COURSE DE CAISSES À SAVON DU MONT CHILIAD — Mairie de San Andréas
--  Fichier 2/3 : SÉCURITÉ (RLS, rôles, permissions)
--
--  Principe : toutes les règles d'accès vivent ici, dans Postgres.
--  Aucune permission n'est appliquée par du JavaScript côté navigateur.
--  Conséquence : ouvrir la console et bidouiller le front ne donne
--  strictement aucun droit supplémentaire.
--
--  À exécuter APRÈS 01_schema.sql
-- =====================================================================


-- =====================================================================
--  1. FONCTIONS D'AIDE
--
--  security definer obligatoire : une policy sur « profils » qui lirait
--  « profils » directement provoquerait une récursion infinie.
--  set search_path : protection contre le détournement de schéma.
-- =====================================================================

-- Le rôle de l'utilisateur connecté (null si anonyme ou compte désactivé)
create or replace function public.mon_role()
returns role_utilisateur
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profils where id = auth.uid() and actif;
$$;

-- Membre du personnel actif (admin OU opérateur)
create or replace function public.est_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profils where id = auth.uid() and actif
  );
$$;

-- Administrateur uniquement
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profils
    where id = auth.uid() and actif and role = 'admin'
  );
$$;


-- =====================================================================
--  2. ACTIVATION DE RLS
--  Sans policy explicite, une table avec RLS active refuse TOUT.
--  C'est le comportement voulu : on ouvre ensuite, ligne par ligne.
-- =====================================================================

alter table profils      enable row level security;
alter table entreprises  enable row level security;
alter table inscriptions enable row level security;
alter table courses      enable row level security;
alter table participants enable row level security;
alter table resultats    enable row level security;
alter table historique   enable row level security;


-- =====================================================================
--  3. PROFILS
--  Chacun voit sa fiche. L'admin voit et gère tout le personnel.
-- =====================================================================

create policy "profil_lecture_soi_ou_admin"
  on profils for select to authenticated
  using (id = auth.uid() or est_admin());

create policy "profil_admin_ecriture"
  on profils for insert to authenticated
  with check (est_admin());

create policy "profil_admin_modification"
  on profils for update to authenticated
  using (est_admin()) with check (est_admin());

create policy "profil_admin_suppression"
  on profils for delete to authenticated
  using (est_admin());


-- =====================================================================
--  4. ENTREPRISES
--  Lecture publique (le formulaire d'inscription en a besoin).
--  Écriture réservée à l'admin : c'est un paramètre du site.
-- =====================================================================

create policy "entreprises_lecture_publique"
  on entreprises for select to anon, authenticated
  using (true);

create policy "entreprises_admin_ecriture"
  on entreprises for all to authenticated
  using (est_admin()) with check (est_admin());


-- =====================================================================
--  5. INSCRIPTIONS
--
--  Point sensible : la table contient des numéros de téléphone.
--  Le public peut ÉCRIRE (formulaire) mais jamais LIRE.
--  Un visiteur ne peut donc pas aspirer la liste des inscrits.
-- =====================================================================

-- Dépôt d'une inscription depuis le formulaire public.
-- with check verrouille les champs de suivi : impossible pour un
-- visiteur de s'auto-valider ou de cocher sa propre décharge.
create policy "inscription_depot_public"
  on inscriptions for insert to anon, authenticated
  with check (
    statut = 'en_attente'
    and decharge_validee = false
    and reglement_ok = true
    and decharge_ok  = true
  );

create policy "inscriptions_lecture_staff"
  on inscriptions for select to authenticated
  using (est_staff());

create policy "inscriptions_modification_staff"
  on inscriptions for update to authenticated
  using (est_staff()) with check (est_staff());

create policy "inscriptions_suppression_staff"
  on inscriptions for delete to authenticated
  using (est_staff());


-- =====================================================================
--  6. COURSES
--  Lecture publique. Création et modification par le staff.
--  Suppression réservée à l'admin (elle emporte les participants
--  et les résultats en cascade — c'est irréversible).
-- =====================================================================

create policy "courses_lecture_publique"
  on courses for select to anon, authenticated
  using (true);

create policy "courses_creation_staff"
  on courses for insert to authenticated
  with check (est_staff());

create policy "courses_modification_staff"
  on courses for update to authenticated
  using (est_staff()) with check (est_staff());

create policy "courses_suppression_admin"
  on courses for delete to authenticated
  using (est_admin());


-- =====================================================================
--  7. PARTICIPANTS
--  Lecture publique : la grille de départ est une information publique.
-- =====================================================================

create policy "participants_lecture_publique"
  on participants for select to anon, authenticated
  using (true);

create policy "participants_ecriture_staff"
  on participants for all to authenticated
  using (est_staff()) with check (est_staff());


-- =====================================================================
--  8. RÉSULTATS — le verrou de publication
--
--  C'est LA policy centrale du cahier des charges.
--  Tant que courses.resultats_publies vaut false, un visiteur anonyme
--  ne reçoit pas la ligne : ni par requête, ni par le WebSocket temps
--  réel, ni à travers les vues de classement.
--  Tu peux donc saisir et corriger tous les temps tranquillement,
--  puis basculer le verrou quand tu es prêt.
-- =====================================================================

create policy "resultats_lecture_conditionnelle"
  on resultats for select to anon, authenticated
  using (
    est_staff()
    or exists (
      select 1
      from participants p
        join courses c on c.id = p.course_id
      where p.id = resultats.participant_id
        and c.resultats_publies = true
    )
  );

create policy "resultats_ecriture_staff"
  on resultats for all to authenticated
  using (est_staff()) with check (est_staff());


-- =====================================================================
--  9. HISTORIQUE
--  Lecture par le staff. Écriture : personne.
--  Les lignes sont insérées exclusivement par la fonction journaliser()
--  qui est en security definer et contourne donc RLS.
--  Résultat : le journal est infalsifiable depuis l'application.
-- =====================================================================

create policy "historique_lecture_staff"
  on historique for select to authenticated
  using (est_staff());

-- Aucune policy insert / update / delete : volontaire.


-- =====================================================================
--  10. PRIVILÈGES
--  RLS filtre les lignes ; les GRANT ouvrent la porte de la table.
--  Il faut les deux.
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- Public : lecture du programme, dépôt d'une inscription
grant select on courses, participants, entreprises to anon;
grant select on resultats to anon;                       -- filtré par RLS
grant select on v_classement_course, v_classement_general to anon;
grant insert on inscriptions to anon;

-- Personnel connecté
grant select, insert, update, delete
  on courses, participants, resultats, inscriptions, entreprises, profils
  to authenticated;
grant select on historique to authenticated;
grant select on v_classement_course, v_classement_general to authenticated;

grant execute on function public.mon_role()  to anon, authenticated;
grant execute on function public.est_staff() to anon, authenticated;
grant execute on function public.est_admin() to anon, authenticated;


-- =====================================================================
--  RÉCAPITULATIF DES PERMISSIONS
--
--                            anonyme   opérateur   admin
--  Déposer une inscription      oui       oui       oui
--  Lire les inscriptions        NON       oui       oui
--  Modifier une inscription     NON       oui       oui
--  Lire le programme            oui       oui       oui
--  Créer / modifier une course  NON       oui       oui
--  Supprimer une course         NON       NON       oui
--  Gérer les participants       NON       oui       oui
--  Saisir un résultat           NON       oui       oui
--  Publier les résultats        NON       oui       oui
--  Lire un résultat non publié  NON       oui       oui
--  Lire l'historique            NON       oui       oui
--  Écrire dans l'historique     NON       NON       NON  (triggers only)
--  Gérer les entreprises        NON       NON       oui
--  Gérer les comptes            NON       NON       oui
--
--  FIN — enchaîner sur 03_seed.sql
-- =====================================================================
