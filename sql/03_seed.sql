-- =====================================================================
--  COURSE DE CAISSES À SAVON DU MONT CHILIAD — Mairie de San Andréas
--  Fichier 3/3 : DONNÉES DE DÉMONSTRATION
--
--  Contenu : 7 entreprises, 10 inscriptions, 6 courses couvrant les
--  5 statuts visuels, 14 participants, 6 résultats dont un abandon.
--
--  Les identifiants sont écrits en dur et lisibles pour faciliter
--  le débogage. Un vrai enregistrement utilisera gen_random_uuid().
--
--  ⚠️  Pour repartir de zéro avant l'événement :
--      truncate inscriptions, courses, historique cascade;
--      (courses emporte participants et resultats en cascade)
--
--  À exécuter APRÈS 01_schema.sql et 02_rls.sql
-- =====================================================================


-- ---------------------------------------------------------------------
--  Les triggers d'audit sont suspendus pendant le remplissage :
--  sans cela, l'historique démarrerait avec 30 lignes de faux
--  événements attribués à personne.
-- ---------------------------------------------------------------------
alter table courses      disable trigger trg_audit_courses;
alter table participants disable trigger trg_audit_participants;
alter table resultats    disable trigger trg_audit_resultats;
alter table inscriptions disable trigger trg_audit_inscriptions;


-- =====================================================================
--  ENTREPRISES
-- =====================================================================

insert into entreprises (id, nom, couleur) values
  ('e0000000-0000-0000-0000-000000000001', 'Fuyo Vision',           '#00bcd4'),
  ('e0000000-0000-0000-0000-000000000002', 'Benny''s Motorworks',   '#f7801a'),
  ('e0000000-0000-0000-0000-000000000003', 'Los Santos Customs',    '#e53935'),
  ('e0000000-0000-0000-0000-000000000004', 'Bahama Mamas',          '#9c27b0'),
  ('e0000000-0000-0000-0000-000000000005', 'Vanilla Unicorn',       '#e91e63'),
  ('e0000000-0000-0000-0000-000000000006', 'Digital Den',           '#2196f3'),
  ('e0000000-0000-0000-0000-000000000007', 'Mairie de San Andréas', '#d4af37');


-- =====================================================================
--  INSCRIPTIONS
--  Mélange volontaire de solo / duo / entreprise, décharges reçues ou
--  non, une inscription encore en attente et une refusée.
-- =====================================================================

insert into inscriptions
  (id, prenom, nom, telephone, nom_equipe, costume, categorie, entreprise_id,
   p2_prenom, p2_nom, p2_telephone, reglement_ok, decharge_ok,
   decharge_validee, commentaire, statut, created_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'Math', 'Baticorte', '555-0142',
   'Les Fusées du Chiliad', true, 'solo', null,
   null, null, null, true, true,
   true, 'Décharge signée sur place le 20/07.', 'validee', now() - interval '12 days'),

  ('a0000000-0000-0000-0000-000000000002', 'Léa', 'Moreau', '555-0288',
   'Savon Express', false, 'duo', null,
   'Tom', 'Vasquez', '555-0289', true, true,
   true, null, 'validee', now() - interval '11 days'),

  ('a0000000-0000-0000-0000-000000000003', 'Karim', 'Delaunay', '555-0317',
   'Team Fuyo', false, 'entreprise', 'e0000000-0000-0000-0000-000000000001',
   'Nina', 'Okonkwo', '555-0318', true, true,
   true, 'Caméra embarquée autorisée.', 'validee', now() - interval '10 days'),

  ('a0000000-0000-0000-0000-000000000004', 'Sofia', 'Renaud', '555-0421',
   'Benny''s Rocket', true, 'entreprise', 'e0000000-0000-0000-0000-000000000002',
   'Marco', 'Bellini', '555-0422', true, true,
   true, null, 'validee', now() - interval '9 days'),

  ('a0000000-0000-0000-0000-000000000005', 'Yann', 'Cabrera', '555-0533',
   'La Boîte à Savon', false, 'solo', null,
   null, null, null, true, true,
   false, 'Relancer pour la décharge.', 'validee', now() - interval '8 days'),

  ('a0000000-0000-0000-0000-000000000006', 'Inès', 'Fontaine', '555-0644',
   'LSC Racing', false, 'entreprise', 'e0000000-0000-0000-0000-000000000003',
   'Hugo', 'Petit', '555-0645', true, true,
   true, null, 'validee', now() - interval '7 days'),

  ('a0000000-0000-0000-0000-000000000007', 'Diego', 'Alvarez', '555-0755',
   'Les Descendeurs', true, 'duo', null,
   'Chloé', 'Bertin', '555-0756', true, true,
   true, null, 'validee', now() - interval '6 days'),

  ('a0000000-0000-0000-0000-000000000008', 'Amel', 'Zerrouki', '555-0866',
   'Bahama Bolides', false, 'entreprise', 'e0000000-0000-0000-0000-000000000004',
   'Victor', 'Lang', '555-0867', true, true,
   true, null, 'validee', now() - interval '5 days'),

  ('a0000000-0000-0000-0000-000000000009', 'Rachel', 'Nguyen', '555-0977',
   'Gravité Zéro', true, 'solo', null,
   null, null, null, true, true,
   false, null, 'en_attente', now() - interval '2 days'),

  ('a0000000-0000-0000-0000-000000000010', 'Bruno', 'Sacchi', '555-1088',
   'Turbo Caisse', false, 'solo', null,
   null, null, null, true, true,
   false, 'Véhicule non conforme au règlement art. 4.', 'refusee', now() - interval '1 day');


-- =====================================================================
--  COURSES
--
--  Les 6 lignes couvrent les 5 statuts visuels du cahier des charges.
--  L'horaire est celui du 1er août 2026, descente de nuit.
--
--  À noter : aucune course n'est marquée « prochaine ». Ce statut est
--  calculé — c'est ici la Manche Publique #2 (première « a_venir »
--  dans l'ordre chronologique). Passe la #1 en « terminee » et la
--  bascule se fait toute seule.
-- =====================================================================

insert into courses
  (id, nom, date_course, heure_depart, type, description, statut, resultats_publies)
values
  -- ⚫ Annulée — barrée, tout en bas de la liste
  ('c0000000-0000-0000-0000-000000000006', 'Manche Découverte',
   '2026-08-01', '20:30', 'publique',
   'Annulée : créneau absorbé par le briefing sécurité.',
   'annulee', false),

  -- 🔴 Terminée — résultats publiés, descend dans la liste
  ('c0000000-0000-0000-0000-000000000001', 'Manche Publique #1',
   '2026-08-01', '21:00', 'publique',
   'Première descente. Départ au sommet, arrivée au village.',
   'terminee', true),

  -- 🟢 En cours — en tête de liste
  ('c0000000-0000-0000-0000-000000000002', 'Manche Entreprises #1',
   '2026-08-01', '21:30', 'entreprise',
   'Manche réservée aux équipages d''entreprise.',
   'en_cours', false),

  -- 🟡 Calculée « prochaine course »
  ('c0000000-0000-0000-0000-000000000003', 'Manche Publique #2',
   '2026-08-01', '22:00', 'publique',
   'Seconde descente. Le meilleur des deux temps est retenu.',
   'a_venir', false),

  -- ⚪ À venir
  ('c0000000-0000-0000-0000-000000000004', 'Manche Entreprises #2',
   '2026-08-01', '22:30', 'entreprise',
   null,
   'a_venir', false),

  -- ⚪ À venir
  ('c0000000-0000-0000-0000-000000000005', 'Grande Finale',
   '2026-08-01', '23:15', 'publique',
   'Les six meilleurs temps de la soirée, toutes catégories confondues.',
   'a_venir', false);


-- =====================================================================
--  PARTICIPANTS
--  Manche Publique #1  : 6 engagés
--  Manche Entreprises #1 : 8 engagés
--  (l'exemple exact du cahier des charges)
-- =====================================================================

-- --- Manche Publique #1 -----------------------------------------------
insert into participants (id, course_id, inscription_id, nom, entreprise_id, dossard, ordre_depart) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'Les Fusées du Chiliad', null, 1, 1),
  ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002', 'Savon Express', null, 2, 2),
  ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000005', 'La Boîte à Savon', null, 3, 3),
  ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000007', 'Les Descendeurs', null, 4, 4),
  -- Ajout manuel le soir même : aucune inscription rattachée.
  ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001',
   null, 'Les Sangliers', null, 5, 5),
  ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001',
   null, 'Chiliad Bombers', null, 6, 6);

-- --- Manche Entreprises #1 --------------------------------------------
insert into participants (id, course_id, inscription_id, nom, entreprise_id, dossard, ordre_depart) values
  ('b0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000003', 'Team Fuyo',      'e0000000-0000-0000-0000-000000000001', 11, 1),
  ('b0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000004', 'Benny''s Rocket', 'e0000000-0000-0000-0000-000000000002', 12, 2),
  ('b0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000006', 'LSC Racing',      'e0000000-0000-0000-0000-000000000003', 13, 3),
  ('b0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000008', 'Bahama Bolides',  'e0000000-0000-0000-0000-000000000004', 14, 4),
  ('b0000000-0000-0000-0000-000000000015', 'c0000000-0000-0000-0000-000000000002',
   null, 'Licorne Volante',   'e0000000-0000-0000-0000-000000000005', 15, 5),
  ('b0000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000002',
   null, 'Den Runners',       'e0000000-0000-0000-0000-000000000006', 16, 6),
  ('b0000000-0000-0000-0000-000000000017', 'c0000000-0000-0000-0000-000000000002',
   null, 'Service Technique', 'e0000000-0000-0000-0000-000000000007', 17, 7),
  ('b0000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000002',
   null, 'Fuyo Backup',       'e0000000-0000-0000-0000-000000000001', 18, 8);

-- --- Grande Finale : grille encore vide -------------------------------
-- (elle se remplira depuis le panel, avec le déplacement de participants
--  d'une course à l'autre)


-- =====================================================================
--  RÉSULTATS
--
--  Manche Publique #1 → résultats publiés, visibles du public.
--  Manche Entreprises #1 → deux temps déjà saisis mais course en cours
--  et verrou fermé : personne ne les voit à part le staff. C'est le
--  scénario exact du cahier des charges.
--
--  Les temps sont en millisecondes.
--  2:47.320 → (2 × 60 + 47) × 1000 + 320 = 167320
-- =====================================================================

-- --- Manche Publique #1 (publiée) -------------------------------------
insert into resultats (participant_id, temps_ms, abandon) values
  ('b0000000-0000-0000-0000-000000000004', 167320, false),  -- 2:47.320 → 1er
  ('b0000000-0000-0000-0000-000000000001', 169880, false),  -- 2:49.880 → 2e
  ('b0000000-0000-0000-0000-000000000006', 171140, false),  -- 2:51.140 → 3e
  ('b0000000-0000-0000-0000-000000000002', 175600, false),  -- 2:55.600 → 4e
  ('b0000000-0000-0000-0000-000000000005', 182910, false),  -- 3:02.910 → 5e
  ('b0000000-0000-0000-0000-000000000003', null,   true);   -- ABANDON → en bas

-- --- Manche Entreprises #1 (saisie en cours, NON publiée) --------------
insert into resultats (participant_id, temps_ms, abandon) values
  ('b0000000-0000-0000-0000-000000000012', 164450, false),  -- 2:44.450
  ('b0000000-0000-0000-0000-000000000011', 166030, false);  -- 2:46.030


-- ---------------------------------------------------------------------
--  Réactivation des triggers d'audit : l'historique enregistre
--  désormais tout ce qui se passe.
-- ---------------------------------------------------------------------
alter table courses      enable trigger trg_audit_courses;
alter table participants enable trigger trg_audit_participants;
alter table resultats    enable trigger trg_audit_resultats;
alter table inscriptions enable trigger trg_audit_inscriptions;


-- =====================================================================
--  VÉRIFICATION RAPIDE
--  Décommenter et exécuter pour contrôler le classement calculé.
-- =====================================================================

-- select position, dossard, participant_nom, temps_ms, abandon
-- from v_classement_course
-- where course_id = 'c0000000-0000-0000-0000-000000000001'
-- order by position nulls last, abandon;

-- Attendu :
--   1 | 4 | Les Descendeurs      | 167320 | f
--   2 | 1 | Les Fusées du Chiliad| 169880 | f
--   3 | 6 | Chiliad Bombers      | 171140 | f
--   4 | 2 | Savon Express        | 175600 | f
--   5 | 5 | Les Sangliers        | 182910 | f
--     | 3 | La Boîte à Savon     |        | t   ← abandon, toujours en bas

-- =====================================================================
--  FIN — la base est prête. Créer maintenant le compte admin :
--  voir INSTALLATION.md, section 3.
-- =====================================================================
