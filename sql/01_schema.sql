-- =====================================================================
--  COURSE DE CAISSES À SAVON DU MONT CHILIAD — Mairie de San Andréas
--  Fichier 1/3 : SCHÉMA (types, tables, index, vues, triggers, realtime)
--
--  Base   : PostgreSQL 15+ / Supabase
--  Ordre  : exécuter 01_schema.sql → 02_rls.sql → 03_seed.sql
--  Où     : Supabase → SQL Editor → New query → coller → Run
-- =====================================================================


-- =====================================================================
--  1. TYPES ÉNUMÉRÉS
-- =====================================================================

-- Rôles du personnel (cf. 02_rls.sql pour les permissions réelles)
create type role_utilisateur as enum ('admin', 'operateur');

-- Catégories d'inscription (reprend le formulaire existant)
create type categorie_inscription as enum ('solo', 'duo', 'entreprise');

-- Cycle de vie d'une inscription
create type statut_inscription as enum ('en_attente', 'validee', 'refusee');

-- Type de course
create type type_course as enum ('publique', 'entreprise');

-- Statut d'une course.
-- NOTE IMPORTANTE : « prochaine course » n'est PAS un statut stocké.
-- C'est un calcul : la course « a_venir » la plus proche dans le temps.
-- La stocker obligerait à la maintenir à la main à chaque changement
-- de programme — source de bugs garantie un soir d'événement.
create type statut_course as enum ('a_venir', 'en_cours', 'terminee', 'annulee');


-- =====================================================================
--  2. TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
--  profils — le personnel (adossé à auth.users géré par Supabase)
--  Les mots de passe ne sont JAMAIS ici : Supabase Auth les stocke
--  chiffrés (bcrypt) dans le schéma auth, inaccessible depuis le front.
-- ---------------------------------------------------------------------
create table profils (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nom         text not null,
  role        role_utilisateur not null default 'operateur',
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table profils is
  'Personnel du site. Un profil est créé automatiquement à chaque inscription '
  'dans auth.users, avec le rôle operateur par défaut.';


-- ---------------------------------------------------------------------
--  entreprises — référentiel partagé inscriptions / participants
-- ---------------------------------------------------------------------
create table entreprises (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null unique,
  couleur     text,                       -- hex optionnel, pour le classement
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
--  inscriptions — alimentée par le formulaire public
-- ---------------------------------------------------------------------
create table inscriptions (
  id               uuid primary key default gen_random_uuid(),

  -- Participant principal
  prenom           text not null,
  nom              text not null,
  telephone        text not null,

  -- Équipe
  nom_equipe       text not null,
  costume          boolean not null default false,
  categorie        categorie_inscription not null,
  entreprise_id    uuid references entreprises(id) on delete set null,

  -- Second participant (duo / entreprise)
  p2_prenom        text,
  p2_nom           text,
  p2_telephone     text,

  -- Cases obligatoires du formulaire
  reglement_ok     boolean not null default false,
  decharge_ok      boolean not null default false,

  -- Suivi organisateur
  decharge_validee boolean not null default false,  -- décharge papier reçue
  commentaire      text,
  statut           statut_inscription not null default 'en_attente',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Un duo sans second participant n'est pas un duo.
  constraint duo_exige_second_participant check (
    categorie = 'solo'
    or (p2_prenom is not null and p2_nom is not null and p2_telephone is not null)
  ),

  -- Une inscription entreprise doit désigner une entreprise.
  constraint entreprise_exige_entreprise check (
    categorie <> 'entreprise' or entreprise_id is not null
  ),

  -- Les deux cases légales sont non négociables.
  constraint conditions_acceptees check (reglement_ok and decharge_ok)
);

create index idx_inscriptions_categorie  on inscriptions (categorie);
create index idx_inscriptions_statut     on inscriptions (statut);
create index idx_inscriptions_entreprise on inscriptions (entreprise_id);
create index idx_inscriptions_created    on inscriptions (created_at desc);


-- ---------------------------------------------------------------------
--  courses — nombre illimité, créées depuis le panel
-- ---------------------------------------------------------------------
create table courses (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null,
  date_course       date not null,
  heure_depart      time not null,
  type              type_course not null default 'publique',
  description       text,
  statut            statut_course not null default 'a_venir',

  -- Verrou de publication : tant que false, le public ne reçoit
  -- AUCUN résultat de cette course (garanti par RLS, pas par le front).
  resultats_publies boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Index de tri principal : l'ordre d'affichage repose dessus.
create index idx_courses_horaire on courses (date_course, heure_depart);
create index idx_courses_statut  on courses (statut);

comment on column courses.resultats_publies is
  'Verrou de publication. Les résultats sont saisissables à tout moment '
  'mais invisibles du public tant que ce champ est à false.';


-- ---------------------------------------------------------------------
--  participants — une ligne = un engagé sur une course
--  inscription_id est nullable : on peut ajouter un participant à la
--  volée le soir même, sans passer par le formulaire public.
-- ---------------------------------------------------------------------
create table participants (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references courses(id) on delete cascade,
  inscription_id uuid references inscriptions(id) on delete set null,

  nom            text not null,          -- nom d'équipe ou de pilote affiché
  entreprise_id  uuid references entreprises(id) on delete set null,
  dossard        integer,
  ordre_depart   integer,

  created_at     timestamptz not null default now(),

  -- Deux dossards identiques sur une même course = classement faux.
  constraint dossard_unique_par_course unique (course_id, dossard),
  -- Un inscrit ne peut pas être engagé deux fois sur la même course.
  constraint inscrit_unique_par_course unique (course_id, inscription_id)
);

create index idx_participants_course      on participants (course_id);
create index idx_participants_inscription on participants (inscription_id);
create index idx_participants_entreprise  on participants (entreprise_id);


-- ---------------------------------------------------------------------
--  resultats — saisie manuelle (le chronométrage est fait ailleurs)
--  temps_ms en entier : tri exact et instantané, pas d'arrondi.
--  L'affichage HH:MM:SS est reconstruit côté front.
-- ---------------------------------------------------------------------
create table resultats (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references participants(id) on delete cascade,

  temps_ms       integer,
  abandon        boolean not null default false,

  saisi_par      uuid references profils(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Soit un temps, soit un abandon. Jamais les deux, jamais aucun.
  constraint temps_ou_abandon check (
    (abandon and temps_ms is null) or (not abandon and temps_ms is not null)
  ),
  constraint temps_positif check (temps_ms is null or temps_ms > 0)
);

create index idx_resultats_participant on resultats (participant_id);


-- ---------------------------------------------------------------------
--  historique — journal d'audit, alimenté par TRIGGER uniquement
--  Le front n'écrit jamais ici : impossible à contourner.
-- ---------------------------------------------------------------------
create table historique (
  id          bigserial primary key,
  user_id     uuid references profils(id) on delete set null,
  user_nom    text not null,             -- figé : survit à la suppression du compte
  action      text not null,             -- creation | modification | suppression
  entite      text not null,             -- nom de la table
  entite_id   uuid,
  libelle     text,                      -- résumé lisible pour l'affichage
  details     jsonb,                     -- état complet de la ligne
  created_at  timestamptz not null default now()
);

create index idx_historique_created on historique (created_at desc);
create index idx_historique_entite  on historique (entite, entite_id);
create index idx_historique_user    on historique (user_id);


-- =====================================================================
--  3. VUES DE CLASSEMENT
--
--  security_invoker = on : la vue s'exécute avec les droits de l'appelant.
--  Conséquence directe : un visiteur anonyme ne voit pas les résultats
--  non publiés, même à travers la vue. Le verrou tient partout.
-- =====================================================================

-- ---------------------------------------------------------------------
--  v_classement_course — classement de chaque course
--  Les temps null (abandon ou non saisi) sont triés en dernier par
--  « nulls last », ils ne décalent donc jamais les positions réelles.
-- ---------------------------------------------------------------------
create view v_classement_course
with (security_invoker = on) as
select
  p.id                as participant_id,
  p.course_id,
  c.nom               as course_nom,
  c.date_course,
  c.heure_depart,
  c.type              as course_type,
  c.statut            as course_statut,
  c.resultats_publies,
  p.nom               as participant_nom,
  p.dossard,
  p.ordre_depart,
  p.entreprise_id,
  e.nom               as entreprise_nom,
  e.couleur           as entreprise_couleur,
  r.temps_ms,
  coalesce(r.abandon, false) as abandon,
  -- Position : uniquement pour les temps réels.
  case when r.temps_ms is null then null
       else rank() over (
         partition by p.course_id
         order by r.temps_ms asc nulls last
       )
  end as position
from participants p
  join courses c        on c.id = p.course_id
  left join entreprises e on e.id = p.entreprise_id
  left join resultats r   on r.participant_id = p.id;


-- ---------------------------------------------------------------------
--  v_classement_general — tous les temps, toutes courses confondues
--  Les filtres (type, course, entreprise, date) s'appliquent côté client
--  sur cette vue.
-- ---------------------------------------------------------------------
create view v_classement_general
with (security_invoker = on) as
select
  p.id                as participant_id,
  p.course_id,
  c.nom               as course_nom,
  c.date_course,
  c.type              as course_type,
  p.nom               as participant_nom,
  p.entreprise_id,
  e.nom               as entreprise_nom,
  r.temps_ms,
  coalesce(r.abandon, false) as abandon,
  case when r.temps_ms is null then null
       else rank() over (order by r.temps_ms asc nulls last)
  end as position_generale
from participants p
  join courses c        on c.id = p.course_id
  left join entreprises e on e.id = p.entreprise_id
  left join resultats r   on r.participant_id = p.id
where c.statut <> 'annulee';


-- =====================================================================
--  4. FONCTIONS & TRIGGERS
-- =====================================================================

-- ---------------------------------------------------------------------
--  updated_at automatique
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_inscriptions_updated before update on inscriptions
  for each row execute function set_updated_at();

create trigger trg_courses_updated before update on courses
  for each row execute function set_updated_at();

create trigger trg_resultats_updated before update on resultats
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------
--  Création automatique du profil à l'inscription d'un utilisateur
--  Rôle par défaut : operateur. Un admin promeut ensuite si besoin.
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profils (id, email, nom, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nom', split_part(new.email, '@', 1)),
    'operateur'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ---------------------------------------------------------------------
--  Journalisation (historique)
--  security definer : le trigger écrit dans historique même si le rôle
--  appelant n'a pas le droit d'y insérer directement.
-- ---------------------------------------------------------------------
create or replace function journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_nom     text;
  v_action  text;
  v_id      uuid;
  v_libelle text;
  v_details jsonb;
  v_ligne   record;
begin
  select nom into v_nom from public.profils where id = v_user;

  if tg_op = 'DELETE' then
    v_action := 'suppression';
    v_id     := old.id;
    v_details := to_jsonb(old);
    v_ligne  := old;
  elsif tg_op = 'UPDATE' then
    v_action := 'modification';
    v_id     := new.id;
    v_details := jsonb_build_object('avant', to_jsonb(old), 'apres', to_jsonb(new));
    v_ligne  := new;
  else
    v_action := 'creation';
    v_id     := new.id;
    v_details := to_jsonb(new);
    v_ligne  := new;
  end if;

  -- Libellé lisible selon la table concernée
  v_libelle := case tg_table_name
    when 'courses'      then v_details #>> '{apres,nom}'
    when 'participants' then v_details #>> '{apres,nom}'
    else null
  end;
  if v_libelle is null then
    v_libelle := coalesce(v_details ->> 'nom', v_details ->> 'nom_equipe', tg_table_name);
  end if;

  -- Cas particulier : publication des résultats, action à part entière
  if tg_table_name = 'courses' and tg_op = 'UPDATE'
     and old.resultats_publies is distinct from new.resultats_publies then
    v_action := case when new.resultats_publies
                     then 'publication_resultats'
                     else 'depublication_resultats' end;
  end if;

  insert into public.historique (user_id, user_nom, action, entite, entite_id, libelle, details)
  values (
    v_user,
    coalesce(v_nom, 'Formulaire public'),
    v_action,
    tg_table_name,
    v_id,
    left(v_libelle, 120),
    v_details
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger trg_audit_courses
  after insert or update or delete on courses
  for each row execute function journaliser();

create trigger trg_audit_participants
  after insert or update or delete on participants
  for each row execute function journaliser();

create trigger trg_audit_resultats
  after insert or update or delete on resultats
  for each row execute function journaliser();

create trigger trg_audit_inscriptions
  after insert or update or delete on inscriptions
  for each row execute function journaliser();


-- =====================================================================
--  5. TEMPS RÉEL
--  Ajout des tables à la publication écoutée par Supabase Realtime.
--  replica identity full : nécessaire pour recevoir l'ancienne version
--  d'une ligne lors d'un UPDATE / DELETE.
-- =====================================================================

alter table courses      replica identity full;
alter table participants replica identity full;
alter table resultats    replica identity full;
alter table inscriptions replica identity full;
alter table entreprises  replica identity full;

alter publication supabase_realtime add table courses;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table resultats;
alter publication supabase_realtime add table inscriptions;
alter publication supabase_realtime add table entreprises;


-- =====================================================================
--  FIN — enchaîner sur 02_rls.sql
-- =====================================================================
