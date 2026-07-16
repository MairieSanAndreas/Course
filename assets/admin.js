/* =====================================================================
   PANEL ADMINISTRATEUR
   Connexion · tableau de bord · inscriptions · courses · participants
   résultats · classements · historique · paramètres

   Les boutons réservés aux administrateurs sont masqués pour les
   opérateurs — mais c'est du confort, pas de la sécurité : les policies
   RLS refusent l'écriture de toute façon (sql/02_rls.sql).
   ===================================================================== */

import {
  db, chargerCourses, chargerParticipants, chargerEntreprises,
  grouperParCourse, trierCourses, trierClassement, ecouter, surReveil, debounce,
  formatTemps, parseTemps, formatEcart, formatDate, formatDateCourte,
  formatHeure, formatDateHeure,
  LIBELLE_STATUT, LIBELLE_TYPE, LIBELLE_CATEGORIE, echapper, celluleEquipe, notifier, messageErreur,
  confirmer, ouvrirModale,
} from './api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => r.querySelectorAll(s);

const etat = {
  profil: null,
  courses: [],
  participants: [],
  inscriptions: [],
  entreprises: [],
  historique: [],
  profils: [],
  vue: 'bord',
  filtres: { recherche: '', categorie: '', statut: '', entreprise: '', course: '' },
};

const estAdmin = () => etat.profil?.role === 'admin';

const LIBELLE_STATUT_INSCRIPTION = {
  en_attente: 'En attente',
  validee: 'Validée',
  refusee: 'Refusée',
};


/* =====================================================================
   1. AUTHENTIFICATION
   ===================================================================== */

async function demarrer() {
  const { data: { session } } = await db.auth.getSession();
  session ? await ouvrirSession(session) : afficherConnexion();

  db.auth.onAuthStateChange((evenement, s) => {
    if (evenement === 'SIGNED_OUT') location.reload();
    if (evenement === 'SIGNED_IN' && !etat.profil) ouvrirSession(s);
  });
}

function afficherConnexion() {
  $('#ecran-connexion').hidden = false;
  $('#app').hidden = true;

  const tenter = async () => {
    const email = $('#c-email').value.trim();
    const mdp = $('#c-mdp').value;
    const err = $('#c-erreur');

    if (!email || !mdp) {
      err.hidden = false;
      err.textContent = 'Renseigne ton identifiant et ton mot de passe.';
      return;
    }

    const btn = $('#btn-connexion');
    btn.disabled = true;
    btn.textContent = 'Connexion…';
    err.hidden = true;

    const { data, error } = await db.auth.signInWithPassword({ email, password: mdp });

    btn.disabled = false;
    btn.textContent = 'Se connecter';

    if (error) {
      err.hidden = false;
      err.textContent = messageErreur(error);
      $('#c-mdp').value = '';
      return;
    }
    await ouvrirSession(data.session);
  };

  $('#btn-connexion').onclick = tenter;
  ['#c-email', '#c-mdp'].forEach((s) => {
    $(s).onkeydown = (e) => { if (e.key === 'Enter') tenter(); };
  });
  $('#c-email').focus();
}

async function ouvrirSession(session) {
  const { data: profil, error } = await db
    .from('profils')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  // Un compte auth sans profil actif ne doit pas entrer.
  if (error || !profil || !profil.actif) {
    await db.auth.signOut();
    afficherConnexion();
    const err = $('#c-erreur');
    err.hidden = false;
    err.textContent = profil && !profil.actif
      ? 'Ce compte est désactivé. Contacte un administrateur.'
      : "Aucun profil n'est rattaché à ce compte. Contacte un administrateur.";
    return;
  }

  etat.profil = profil;

  $('#ecran-connexion').hidden = true;
  $('#app').hidden = false;
  $('#compte-nom').textContent = profil.nom;
  $('#compte-role').textContent = profil.role === 'admin' ? 'Administrateur' : 'Opérateur';
  $('#compte-jeton').textContent = profil.nom.slice(0, 2).toUpperCase();
  $('#nav-parametres').hidden = !estAdmin();

  $('#btn-deconnexion').onclick = async () => {
    if (await confirmer({
      titre: 'Se déconnecter',
      message: 'Tu vas être déconnecté de l’espace organisation.',
      bouton: 'Se déconnecter',
      danger: false,
    })) await db.auth.signOut();
  };

  $$('.nav-item').forEach((b) => { b.onclick = () => allerA(b.dataset.vue); });

  await rafraichir();

  const redessiner = debounce(async () => { await charger(); dessiner(); }, 220);
  ecouter(
    ['courses', 'participants', 'resultats', 'inscriptions', 'entreprises', 'historique'],
    redessiner,
    (connecte) => {
      const t = $('#temoin-direct');
      t.classList.toggle('actif', connecte);
      t.textContent = connecte ? 'En direct' : 'Hors ligne';
    },
  );
  surReveil(redessiner);

  const cible = location.hash.slice(1);
  if (cible) allerA(cible);
}


/* =====================================================================
   2. CHARGEMENT
   ===================================================================== */

async function charger() {
  const [courses, participants, entreprises, inscriptions, historique] = await Promise.all([
    chargerCourses(),
    chargerParticipants(),
    chargerEntreprises(),
    db.from('inscriptions').select('*, entreprises(nom)').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) throw error; return data; }),
    db.from('historique').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) throw error; return data; }),
  ]);

  Object.assign(etat, { courses, participants, entreprises, inscriptions, historique });

  if (estAdmin()) {
    const { data } = await db.from('profils').select('*').order('nom');
    etat.profils = data ?? [];
  }

  $('#n-inscriptions').textContent = inscriptions.length;
  $('#n-courses').textContent = courses.length;
  $('#n-participants').textContent = participants.length;
}

async function rafraichir() {
  try { await charger(); dessiner(); }
  catch (e) { notifier(messageErreur(e), 'erreur'); }
}

function allerA(vue) {
  etat.vue = vue;
  etat.filtres.recherche = '';
  $$('.nav-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.vue === vue)));
  history.replaceState(null, '', `#${vue}`);
  dessiner();
}

const TITRES = {
  bord: 'Tableau de bord', inscriptions: 'Inscriptions', courses: 'Courses',
  participants: 'Participants', resultats: 'Résultats', classements: 'Classements',
  historique: 'Historique', parametres: 'Paramètres',
};

function dessiner() {
  $('#titre-vue').textContent = TITRES[etat.vue] ?? '';
  const rendus = {
    bord: vueBord, inscriptions: vueInscriptions, courses: vueCourses,
    participants: vueParticipants, resultats: vueResultats, classements: vueClassements,
    historique: vueHistorique, parametres: vueParametres,
  };
  (rendus[etat.vue] ?? vueBord)();
}


/* =====================================================================
   3. OUTILS
   ===================================================================== */

/* Export CSV — séparateur point-virgule et BOM UTF-8 : c'est ce qu'Excel
   en français attend. Une virgule et pas de BOM, et tout atterrit dans
   une seule colonne avec les accents cassés. */
function exporterCSV(nomFichier, colonnes, lignes) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    colonnes.map((c) => cell(c.titre)).join(';'),
    ...lignes.map((l) => colonnes.map((c) => cell(c.valeur(l))).join(';')),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomFichier}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  notifier(`${lignes.length} ligne(s) exportée(s)`, 'succes');
}

function optionsCourses(selection = '') {
  return trierCourses(etat.courses)
    .map((c) => `<option value="${c.id}" ${c.id === selection ? 'selected' : ''}>
      ${echapper(c.nom)} — ${formatHeure(c.heure_depart)}</option>`)
    .join('');
}

function optionsEntreprises(selection = '') {
  return '<option value="">— Aucune —</option>' + etat.entreprises
    .map((e) => `<option value="${e.id}" ${e.id === selection ? 'selected' : ''}>${echapper(e.nom)}</option>`)
    .join('');
}

function brancherRecherche() {
  const champ = $('#f-recherche');
  if (!champ) return;
  champ.oninput = debounce(() => { etat.filtres.recherche = champ.value.toLowerCase(); dessiner(); }, 200);
  if (etat.filtres.recherche) { champ.value = etat.filtres.recherche; champ.focus(); }
}


/* =====================================================================
   4. TABLEAU DE BORD
   ===================================================================== */

function vueBord() {
  const courses = trierCourses(etat.courses);
  const prochaine = courses.find((c) => c.statutAffiche === 'prochaine');
  const enCours = courses.find((c) => c.statutAffiche === 'en_cours');
  const valides = etat.inscriptions.filter((i) => i.statut === 'validee');
  const attente = etat.inscriptions.filter((i) => i.statut === 'en_attente');
  const dechargesManquantes = valides.filter((i) => !i.decharge_validee);
  const publiees = etat.courses.filter((c) => c.resultats_publies);

  // Inscrits par course : demandé au §2 du cahier des charges.
  const parCourse = grouperParCourse(etat.participants);

  $('#vue').innerHTML = `
    <div class="stats" style="margin-bottom:24px">
      <div class="stat">
        <div class="stat-val">${etat.inscriptions.length}</div>
        <div class="stat-lib">Inscriptions</div>
        <div class="stat-detail">${valides.length} validée(s) · ${attente.length} en attente</div>
      </div>
      <div class="stat">
        <div class="stat-val">${etat.courses.length}</div>
        <div class="stat-lib">Courses</div>
        <div class="stat-detail">${publiees.length} résultat(s) publié(s)</div>
      </div>
      <div class="stat">
        <div class="stat-val">${etat.participants.length}</div>
        <div class="stat-lib">Participants engagés</div>
        <div class="stat-detail">${etat.participants.filter((p) => p.temps_ms != null || p.abandon).length} chronométré(s)</div>
      </div>
      <div class="stat">
        <div class="stat-val" style="color:${dechargesManquantes.length ? 'var(--s-prochaine)' : 'var(--succes)'}">
          ${dechargesManquantes.length}
        </div>
        <div class="stat-lib">Décharges manquantes</div>
        <div class="stat-detail">${dechargesManquantes.length ? 'À récupérer avant le départ' : 'Toutes reçues'}</div>
      </div>
    </div>

    ${enCours ? `
      <div class="course en_cours" style="margin-bottom:12px">
        <div class="course-tete">
          <div style="flex:1">
            <p class="eyebrow" style="margin-bottom:4px">Course en cours</p>
            <h3 class="course-nom">${echapper(enCours.nom)}</h3>
            <div class="course-meta">
              <span class="course-heure">${formatHeure(enCours.heure_depart)}</span>
              <span>${(parCourse.get(enCours.id) ?? []).length} participants</span>
            </div>
          </div>
          <button class="btn btn-or btn-mini" data-saisir>Saisir les temps</button>
        </div>
      </div>` : ''}

    ${prochaine ? `
      <div class="course prochaine" style="margin-bottom:24px">
        <div class="course-tete">
          <div style="flex:1">
            <p class="eyebrow" style="margin-bottom:4px">Prochaine course</p>
            <h3 class="course-nom">${echapper(prochaine.nom)}</h3>
            <div class="course-meta">
              <span>${formatDate(prochaine.date_course)}</span>
              <span class="course-heure">${formatHeure(prochaine.heure_depart)}</span>
              <span class="badge-type ${prochaine.type}">${LIBELLE_TYPE[prochaine.type]}</span>
              <span>${(parCourse.get(prochaine.id) ?? []).length} participants</span>
            </div>
          </div>
        </div>
      </div>` : ''}

    <div class="grille grille-2" style="align-items:start">
      <div class="panneau">
        <h2 class="titre-section" style="margin-bottom:16px">Dernières inscriptions</h2>
        ${etat.inscriptions.length ? etat.inscriptions.slice(0, 6).map((i) => `
          <div class="ligne" style="padding:9px 0;border-bottom:1px solid var(--trait)">
            <div style="min-width:0;flex:1">
              <div style="font-weight:600;font-size:14px">${echapper(i.nom_equipe)}</div>
              <div style="font-size:12px;color:var(--texte-3)">
                ${echapper(i.prenom)} ${echapper(i.nom)} · ${LIBELLE_CATEGORIE[i.categorie]}
              </div>
            </div>
            <span class="mini-badge ${i.statut === 'validee' ? 'ok' : i.statut === 'refusee' ? 'ko' : 'attente'}">
              ${LIBELLE_STATUT_INSCRIPTION[i.statut]}
            </span>
          </div>`).join('')
        : '<p style="color:var(--texte-3);font-size:14px">Aucune inscription pour le moment.</p>'}
      </div>

      <div class="panneau">
        <h2 class="titre-section" style="margin-bottom:16px">Derniers résultats publiés</h2>
        ${publiees.length ? publiees.map((c) => {
          const lignes = trierClassement(parCourse.get(c.id) ?? []);
          const premier = lignes.find((l) => l.temps_ms != null);
          return `
          <div class="ligne" style="padding:9px 0;border-bottom:1px solid var(--trait)">
            <div style="min-width:0;flex:1">
              <div style="font-weight:600;font-size:14px">${echapper(c.nom)}</div>
              <div style="font-size:12px;color:var(--texte-3)">
                ${premier ? `1ᵉʳ · ${echapper(premier.participant_nom)}` : 'Aucun temps'}
              </div>
            </div>
            ${premier ? `<span class="temps" style="color:var(--or);font-size:14px">${formatTemps(premier.temps_ms)}</span>` : ''}
          </div>`;
        }).join('')
        : '<p style="color:var(--texte-3);font-size:14px">Aucun résultat publié.</p>'}
      </div>
    </div>`;

  $('[data-saisir]')?.addEventListener('click', () => allerA('resultats'));
}


/* =====================================================================
   5. INSCRIPTIONS
   ===================================================================== */

function filtrerInscriptions() {
  const { recherche, categorie, statut, entreprise } = etat.filtres;
  return etat.inscriptions.filter((i) => {
    if (categorie && i.categorie !== categorie) return false;
    if (statut && i.statut !== statut) return false;
    if (entreprise && i.entreprise_id !== entreprise) return false;
    if (!recherche) return true;
    return [i.prenom, i.nom, i.nom_equipe, i.telephone, i.p2_prenom, i.p2_nom, i.entreprises?.nom]
      .filter(Boolean).join(' ').toLowerCase().includes(recherche);
  });
}

function vueInscriptions() {
  const lignes = filtrerInscriptions();

  // Répartition par course — §2 du cahier des charges.
  const parCourse = grouperParCourse(etat.participants);
  const repartition = trierCourses(etat.courses)
    .map((c) => `${echapper(c.nom)} : ${(parCourse.get(c.id) ?? []).length}`)
    .join(' · ');

  $('#vue').innerHTML = `
    <div class="outils">
      <div class="recherche">
        <input type="text" id="f-recherche" placeholder="Nom, équipe, téléphone…">
      </div>
      <select id="f-categorie" style="width:auto">
        <option value="">Toutes catégories</option>
        <option value="solo">Solo</option>
        <option value="duo">Duo</option>
        <option value="entreprise">Entreprise</option>
      </select>
      <select id="f-statut" style="width:auto">
        <option value="">Tous statuts</option>
        <option value="en_attente">En attente</option>
        <option value="validee">Validée</option>
        <option value="refusee">Refusée</option>
      </select>
      <select id="f-entreprise" style="width:auto">
        <option value="">Toutes entreprises</option>
        ${etat.entreprises.map((e) => `<option value="${e.id}">${echapper(e.nom)}</option>`).join('')}
      </select>
      <button class="btn btn-mini pousse" id="btn-csv">Exporter CSV</button>
      <button class="btn btn-or btn-mini" id="btn-ajouter">+ Inscription</button>
    </div>

    <p class="aide" style="margin-bottom:14px">
      <strong style="color:var(--texte)">${lignes.length}</strong> inscription(s) affichée(s)
      sur ${etat.inscriptions.length} · Statut et décharge se modifient directement dans le tableau
      · Engagés par course — ${repartition || 'aucune course'}
    </p>

    ${lignes.length ? `
    <div class="tbl-enveloppe">
      <table class="tbl">
        <thead>
          <tr>
            <th>Équipe</th><th>Participant(s)</th><th>Téléphone</th>
            <th>Catégorie</th><th>Entreprise</th><th>Décharge</th>
            <th>Statut</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${lignes.map((i) => `
            <tr class="${i.decharge_validee ? 'decharge-ok' : ''} ${i.statut === 'refusee' ? 'refusee' : ''}">
              <td style="font-weight:600">
                ${echapper(i.nom_equipe)}
                ${i.costume ? '<span class="mini-badge or" style="margin-left:6px">Costume</span>' : ''}
              </td>
              <td style="font-size:13px">
                ${echapper(i.prenom)} ${echapper(i.nom)}
                ${i.p2_prenom ? `<div style="color:var(--texte-3)">+ ${echapper(i.p2_prenom)} ${echapper(i.p2_nom)}</div>` : ''}
              </td>
              <td style="font-family:var(--f-chrono);font-size:12px;color:var(--texte-2)">
                ${echapper(i.telephone)}
                ${i.p2_telephone ? `<div>${echapper(i.p2_telephone)}</div>` : ''}
              </td>
              <td><span class="mini-badge">${LIBELLE_CATEGORIE[i.categorie]}</span></td>
              <td style="font-size:13px;color:var(--texte-2)">${echapper(i.entreprises?.nom ?? '—')}</td>
              <td>
                <button class="mini-badge ${i.decharge_validee ? 'ok' : 'attente'}"
                        data-decharge="${i.id}" title="Basculer la réception de la décharge">
                  ${i.decharge_validee ? 'Reçue' : 'Manquante'}
                </button>
              </td>
              <td>
                <select class="statut-inline ${i.statut}" data-statut-inscription="${i.id}">
                  <option value="en_attente" ${i.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
                  <option value="validee"    ${i.statut === 'validee' ? 'selected' : ''}>Validée</option>
                  <option value="refusee"    ${i.statut === 'refusee' ? 'selected' : ''}>Refusée</option>
                </select>
              </td>
              <td>
                <div class="actions">
                  <button class="btn-icone" data-editer="${i.id}" title="Modifier">✎</button>
                  <button class="btn-icone" data-supprimer="${i.id}" title="Supprimer">🗑</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `
    <div class="vide">
      <div class="vide-titre">Aucune inscription</div>
      <p>${etat.inscriptions.length
        ? 'Aucune inscription ne correspond à ces filtres.'
        : 'Les inscriptions déposées sur le site public apparaîtront ici automatiquement.'}</p>
    </div>`}`;

  brancherRecherche();

  ['categorie', 'statut', 'entreprise'].forEach((f) => {
    const el = $(`#f-${f}`);
    el.value = etat.filtres[f];
    el.onchange = () => { etat.filtres[f] = el.value; dessiner(); };
  });

  $('#btn-ajouter').onclick = () => modaleInscription(null);
  $('#btn-csv').onclick = () => exporterCSV('inscriptions', [
    { titre: 'Équipe', valeur: (i) => i.nom_equipe },
    { titre: 'Prénom', valeur: (i) => i.prenom },
    { titre: 'Nom', valeur: (i) => i.nom },
    { titre: 'Téléphone', valeur: (i) => i.telephone },
    { titre: 'Catégorie', valeur: (i) => i.categorie },
    { titre: 'Entreprise', valeur: (i) => i.entreprises?.nom ?? '' },
    { titre: 'Prénom 2', valeur: (i) => i.p2_prenom ?? '' },
    { titre: 'Nom 2', valeur: (i) => i.p2_nom ?? '' },
    { titre: 'Téléphone 2', valeur: (i) => i.p2_telephone ?? '' },
    { titre: 'Costume', valeur: (i) => (i.costume ? 'Oui' : 'Non') },
    { titre: 'Décharge reçue', valeur: (i) => (i.decharge_validee ? 'Oui' : 'Non') },
    { titre: 'Statut', valeur: (i) => i.statut },
    { titre: 'Commentaire', valeur: (i) => i.commentaire ?? '' },
    { titre: 'Inscrit le', valeur: (i) => formatDateHeure(i.created_at) },
  ], lignes);

  $$('[data-decharge]').forEach((b) => {
    b.onclick = async () => {
      const i = etat.inscriptions.find((x) => x.id === b.dataset.decharge);
      const { error } = await db.from('inscriptions')
        .update({ decharge_validee: !i.decharge_validee }).eq('id', i.id);
      if (error) notifier(messageErreur(error), 'erreur');
      else await rafraichir();
    };
  });

  // Statut modifiable sur place : c'est le geste le plus répété avant
  // l'événement. Un select plutôt qu'un bouton qui bascule — avec trois
  // états, un clic de trop refuserait quelqu'un par accident.
  $$('[data-statut-inscription]').forEach((sel) => {
    sel.onchange = async () => {
      const id = sel.dataset.statutInscription;
      const i = etat.inscriptions.find((x) => x.id === id);
      const { error } = await db.from('inscriptions')
        .update({ statut: sel.value }).eq('id', id);
      if (error) notifier(messageErreur(error), 'erreur');
      else notifier(`${i.nom_equipe} — ${LIBELLE_STATUT_INSCRIPTION[sel.value]}`, 'succes');
      await rafraichir();
    };
  });

  $$('[data-editer]').forEach((b) => {
    b.onclick = () => modaleInscription(etat.inscriptions.find((x) => x.id === b.dataset.editer));
  });

  $$('[data-supprimer]').forEach((b) => {
    b.onclick = async () => {
      const i = etat.inscriptions.find((x) => x.id === b.dataset.supprimer);
      const engage = etat.participants.some((p) => p.inscription_id === i.id);
      if (await confirmer({
        titre: 'Supprimer l’inscription',
        message: `<strong>${echapper(i.nom_equipe)}</strong> — ${echapper(i.prenom)} ${echapper(i.nom)}.
          ${engage ? '<br><br>Cette équipe est engagée sur une course. Le participant sera conservé mais perdra son rattachement à l’inscription.' : ''}
          <br><br>Cette action est irréversible.`,
      })) {
        const { error } = await db.from('inscriptions').delete().eq('id', i.id);
        if (error) notifier(messageErreur(error), 'erreur');
        else { notifier('Inscription supprimée', 'succes'); await rafraichir(); }
      }
    };
  });
}

function modaleInscription(inscription) {
  const nouvelle = !inscription;
  const i = inscription ?? { categorie: 'solo', costume: false, statut: 'en_attente', decharge_validee: false };

  ouvrirModale({
    titre: nouvelle ? 'Ajouter une inscription' : 'Modifier l’inscription',
    large: true,
    contenu: `
      <div class="grille grille-2">
        <div class="champ">
          <label for="m-categorie">Catégorie *</label>
          <select id="m-categorie">
            <option value="solo" ${i.categorie === 'solo' ? 'selected' : ''}>Solo</option>
            <option value="duo" ${i.categorie === 'duo' ? 'selected' : ''}>Duo</option>
            <option value="entreprise" ${i.categorie === 'entreprise' ? 'selected' : ''}>Entreprise</option>
          </select>
        </div>
        <div class="champ">
          <label for="m-statut">Statut</label>
          <select id="m-statut">
            <option value="en_attente" ${i.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
            <option value="validee" ${i.statut === 'validee' ? 'selected' : ''}>Validée</option>
            <option value="refusee" ${i.statut === 'refusee' ? 'selected' : ''}>Refusée</option>
          </select>
        </div>
      </div>

      <div class="champ" id="m-bloc-entreprise" ${i.categorie !== 'entreprise' ? 'hidden' : ''}>
        <label for="m-entreprise">Entreprise *</label>
        <select id="m-entreprise">${optionsEntreprises(i.entreprise_id)}</select>
      </div>

      <div class="champ">
        <label for="m-equipe">Nom d'équipe *</label>
        <input type="text" id="m-equipe" value="${echapper(i.nom_equipe ?? '')}" maxlength="60">
      </div>

      <div class="grille grille-3">
        <div class="champ"><label for="m-prenom">Prénom *</label>
          <input type="text" id="m-prenom" value="${echapper(i.prenom ?? '')}" maxlength="60"></div>
        <div class="champ"><label for="m-nom">Nom *</label>
          <input type="text" id="m-nom" value="${echapper(i.nom ?? '')}" maxlength="60"></div>
        <div class="champ"><label for="m-tel">Téléphone *</label>
          <input type="tel" id="m-tel" value="${echapper(i.telephone ?? '')}" maxlength="20"></div>
      </div>

      <div id="m-bloc-p2" ${i.categorie === 'solo' ? 'hidden' : ''}>
        <p class="eyebrow" style="margin:8px 0 12px">Second participant</p>
        <div class="grille grille-3">
          <div class="champ"><label for="m-p2-prenom">Prénom *</label>
            <input type="text" id="m-p2-prenom" value="${echapper(i.p2_prenom ?? '')}" maxlength="60"></div>
          <div class="champ"><label for="m-p2-nom">Nom *</label>
            <input type="text" id="m-p2-nom" value="${echapper(i.p2_nom ?? '')}" maxlength="60"></div>
          <div class="champ"><label for="m-p2-tel">Téléphone *</label>
            <input type="tel" id="m-p2-tel" value="${echapper(i.p2_telephone ?? '')}" maxlength="20"></div>
        </div>
      </div>

      <label class="case"><input type="checkbox" id="m-costume" ${i.costume ? 'checked' : ''}>
        <span>Équipe costumée</span></label>
      <label class="case"><input type="checkbox" id="m-decharge" ${i.decharge_validee ? 'checked' : ''}>
        <span>Décharge de responsabilité reçue</span></label>

      <div class="champ" style="margin-top:16px">
        <label for="m-commentaire">Commentaire interne</label>
        <textarea id="m-commentaire" maxlength="500">${echapper(i.commentaire ?? '')}</textarea>
      </div>

      <p class="erreur-champ" id="m-erreur" hidden></p>`,

    onValider: async (corps) => {
      const v = (id) => $(`#${id}`, corps).value.trim();
      const categorie = $('#m-categorie', corps).value;
      const duo = categorie !== 'solo';
      const err = $('#m-erreur', corps);

      const manque = [];
      if (!v('m-equipe')) manque.push("nom d'équipe");
      if (!v('m-prenom')) manque.push('prénom');
      if (!v('m-nom')) manque.push('nom');
      if (!v('m-tel')) manque.push('téléphone');
      if (duo && (!v('m-p2-prenom') || !v('m-p2-nom') || !v('m-p2-tel'))) manque.push('second participant');
      if (categorie === 'entreprise' && !$('#m-entreprise', corps).value) manque.push('entreprise');

      if (manque.length) {
        err.hidden = false;
        err.textContent = `À compléter : ${manque.join(', ')}.`;
        return false;
      }

      const donnees = {
        prenom: v('m-prenom'), nom: v('m-nom'), telephone: v('m-tel'),
        nom_equipe: v('m-equipe'), categorie,
        entreprise_id: categorie === 'entreprise' ? $('#m-entreprise', corps).value : null,
        p2_prenom: duo ? v('m-p2-prenom') : null,
        p2_nom: duo ? v('m-p2-nom') : null,
        p2_telephone: duo ? v('m-p2-tel') : null,
        costume: $('#m-costume', corps).checked,
        decharge_validee: $('#m-decharge', corps).checked,
        statut: $('#m-statut', corps).value,
        commentaire: v('m-commentaire') || null,
        reglement_ok: true, decharge_ok: true,
      };

      const { error } = nouvelle
        ? await db.from('inscriptions').insert(donnees)
        : await db.from('inscriptions').update(donnees).eq('id', i.id);

      if (error) {
        err.hidden = false;
        err.textContent = messageErreur(error);
        return false;
      }
      notifier(nouvelle ? 'Inscription ajoutée' : 'Inscription modifiée', 'succes');
      await rafraichir();
      return true;
    },
  });

  // Les blocs conditionnels suivent la catégorie, comme sur le formulaire public.
  const maj = () => {
    const c = $('#m-categorie').value;
    $('#m-bloc-p2').hidden = c === 'solo';
    $('#m-bloc-entreprise').hidden = c !== 'entreprise';
  };
  $('#m-categorie').onchange = maj;
}


/* =====================================================================
   6. COURSES
   ===================================================================== */

function vueCourses() {
  const courses = trierCourses(etat.courses);
  const parCourse = grouperParCourse(etat.participants);

  $('#vue').innerHTML = `
    <div class="outils">
      <p class="aide" style="margin:0">
        Ordre d'affichage automatique : en cours → prochaine → à venir → terminées → annulées.
      </p>
      <button class="btn btn-or btn-mini pousse" id="btn-nouvelle">+ Nouvelle course</button>
    </div>

    ${courses.length ? `<div class="grille" style="gap:10px">
      ${courses.map((c) => {
        const nb = (parCourse.get(c.id) ?? []).length;
        return `
        <article class="course ${c.statutAffiche}" data-cle="c-${c.id}">
          <div class="course-tete">
            <div style="flex:1;min-width:0">
              <h3 class="course-nom">${echapper(c.nom)}</h3>
              <div class="course-meta">
                <span>${formatDateCourte(c.date_course)}</span>
                <span class="course-heure">${formatHeure(c.heure_depart)}</span>
                <span class="badge-type ${c.type}">${LIBELLE_TYPE[c.type]}</span>
                <span>${nb} participant${nb > 1 ? 's' : ''}</span>
                ${c.resultats_publies
                  ? '<span class="mini-badge ok">Résultats publiés</span>'
                  : '<span class="mini-badge attente">Non publiés</span>'}
              </div>
            </div>
            <span class="pastille ${c.statutAffiche}">${LIBELLE_STATUT[c.statutAffiche]}</span>
          </div>

          ${c.description ? `<p class="course-desc">${echapper(c.description)}</p>` : ''}

          <div class="ligne" style="margin-top:16px">
            <select data-statut="${c.id}" style="width:auto;padding:7px 10px;font-size:12px">
              ${['a_venir', 'en_cours', 'terminee', 'annulee'].map((s) =>
                `<option value="${s}" ${c.statut === s ? 'selected' : ''}>${LIBELLE_STATUT[s]}</option>`).join('')}
            </select>
            <button class="btn btn-mini" data-participants="${c.id}">Participants (${nb})</button>
            <button class="btn btn-mini" data-modifier="${c.id}">Modifier</button>
            ${estAdmin() ? `<button class="btn btn-mini btn-danger" data-supprimer="${c.id}">Supprimer</button>` : ''}
          </div>
        </article>`;
      }).join('')}
    </div>` : `
    <div class="vide">
      <div class="vide-titre">Aucune course</div>
      <p>Crée la première manche. Le nombre de courses n'est pas limité.</p>
    </div>`}`;

  $('#btn-nouvelle').onclick = () => modaleCourse(null);

  $$('[data-statut]').forEach((sel) => {
    sel.onchange = async () => {
      const { error } = await db.from('courses')
        .update({ statut: sel.value }).eq('id', sel.dataset.statut);
      if (error) { notifier(messageErreur(error), 'erreur'); await rafraichir(); }
      else notifier(`Statut : ${LIBELLE_STATUT[sel.value]}`, 'succes');
    };
  });

  $$('[data-modifier]').forEach((b) => {
    b.onclick = () => modaleCourse(etat.courses.find((c) => c.id === b.dataset.modifier));
  });

  $$('[data-participants]').forEach((b) => {
    b.onclick = () => { etat.filtres.course = b.dataset.participants; allerA('participants'); };
  });

  $$('[data-supprimer]').forEach((b) => {
    b.onclick = async () => {
      const c = etat.courses.find((x) => x.id === b.dataset.supprimer);
      const nb = (parCourse.get(c.id) ?? []).length;
      if (await confirmer({
        titre: 'Supprimer la course',
        message: `<strong>${echapper(c.nom)}</strong><br><br>
          ${nb ? `Les <strong>${nb} participant(s)</strong> engagés et leurs résultats seront supprimés avec elle.<br><br>` : ''}
          Cette action est irréversible. Pour conserver la trace de la course, passe-la en
          <em>Annulée</em> plutôt que de la supprimer.`,
      })) {
        const { error } = await db.from('courses').delete().eq('id', c.id);
        if (error) notifier(messageErreur(error), 'erreur');
        else { notifier('Course supprimée', 'succes'); await rafraichir(); }
      }
    };
  });
}

function modaleCourse(course) {
  const nouvelle = !course;
  const c = course ?? {
    type: 'publique', statut: 'a_venir',
    date_course: new Date().toISOString().slice(0, 10),
    heure_depart: '21:00',
  };

  ouvrirModale({
    titre: nouvelle ? 'Nouvelle course' : 'Modifier la course',
    contenu: `
      <div class="champ">
        <label for="k-nom">Nom ou numéro *</label>
        <input type="text" id="k-nom" value="${echapper(c.nom ?? '')}" maxlength="80"
               placeholder="Manche Publique #3">
      </div>

      <div class="grille grille-2">
        <div class="champ">
          <label for="k-date">Date *</label>
          <input type="date" id="k-date" value="${c.date_course}">
        </div>
        <div class="champ">
          <label for="k-heure">Heure de départ *</label>
          <input type="time" id="k-heure" value="${String(c.heure_depart).slice(0, 5)}">
        </div>
      </div>

      <div class="grille grille-2">
        <div class="champ">
          <label for="k-type">Type *</label>
          <select id="k-type">
            <option value="publique" ${c.type === 'publique' ? 'selected' : ''}>Publique</option>
            <option value="entreprise" ${c.type === 'entreprise' ? 'selected' : ''}>Entreprise</option>
          </select>
        </div>
        <div class="champ">
          <label for="k-statut">Statut</label>
          <select id="k-statut">
            ${['a_venir', 'en_cours', 'terminee', 'annulee'].map((s) =>
              `<option value="${s}" ${c.statut === s ? 'selected' : ''}>${LIBELLE_STATUT[s]}</option>`).join('')}
          </select>
          <p class="aide">« Prochaine course » se calcule tout seul.</p>
        </div>
      </div>

      <div class="champ">
        <label for="k-desc">Description</label>
        <textarea id="k-desc" maxlength="400">${echapper(c.description ?? '')}</textarea>
      </div>

      <p class="erreur-champ" id="k-erreur" hidden></p>`,

    onValider: async (corps) => {
      const err = $('#k-erreur', corps);
      const nom = $('#k-nom', corps).value.trim();
      const date = $('#k-date', corps).value;
      const heure = $('#k-heure', corps).value;

      if (!nom || !date || !heure) {
        err.hidden = false;
        err.textContent = 'Le nom, la date et l’heure de départ sont obligatoires.';
        return false;
      }

      const donnees = {
        nom, date_course: date, heure_depart: heure,
        type: $('#k-type', corps).value,
        statut: $('#k-statut', corps).value,
        description: $('#k-desc', corps).value.trim() || null,
      };

      const { error } = nouvelle
        ? await db.from('courses').insert(donnees)
        : await db.from('courses').update(donnees).eq('id', c.id);

      if (error) { err.hidden = false; err.textContent = messageErreur(error); return false; }
      notifier(nouvelle ? 'Course créée' : 'Course modifiée', 'succes');
      await rafraichir();
      return true;
    },
  });
}


/* =====================================================================
   7. PARTICIPANTS
   ===================================================================== */

function vueParticipants() {
  const { recherche, course } = etat.filtres;

  let lignes = etat.participants;
  if (course) lignes = lignes.filter((p) => p.course_id === course);
  if (recherche) {
    lignes = lignes.filter((p) => [p.participant_nom, p.entreprise_nom, p.course_nom]
      .filter(Boolean).join(' ').toLowerCase().includes(recherche));
  }
  lignes = [...lignes].sort((a, b) =>
    a.course_nom.localeCompare(b.course_nom) || (a.ordre_depart ?? 0) - (b.ordre_depart ?? 0));

  $('#vue').innerHTML = `
    <div class="outils">
      <div class="recherche"><input type="text" id="f-recherche" placeholder="Participant, entreprise…"></div>
      <select id="f-course" style="width:auto">
        <option value="">Toutes les courses</option>
        ${optionsCourses(course)}
      </select>
      <button class="btn btn-mini pousse" id="btn-csv">Exporter CSV</button>
      <button class="btn btn-or btn-mini" id="btn-ajouter"
              ${etat.courses.length ? '' : 'disabled title="Crée d’abord une course"'}>+ Participant</button>
    </div>

    <p class="aide" style="margin-bottom:14px">${lignes.length} participant(s) affiché(s)</p>

    ${lignes.length ? `
    <div class="tbl-enveloppe">
      <table class="tbl">
        <thead>
          <tr><th style="width:60px">N°</th><th>Participant</th><th>Entreprise</th>
              <th>Course</th><th>Départ</th><th>Résultat</th><th></th></tr>
        </thead>
        <tbody>
          ${lignes.map((p) => `
            <tr>
              <td><span class="dossard">${p.dossard ?? '—'}</span></td>
              <td>${celluleEquipe(p)}
                ${p.inscription_id ? '' : '<span class="mini-badge">Ajout manuel</span>'}</td>
              <td style="color:var(--texte-2);font-size:13px">${echapper(p.entreprise_nom ?? '—')}</td>
              <td style="font-size:13px">${echapper(p.course_nom)}</td>
              <td style="font-family:var(--f-chrono);font-size:12px;color:var(--texte-3)">${p.ordre_depart ?? '—'}</td>
              <td>${p.abandon
                ? '<span class="abandon-tag">Abandon</span>'
                : p.temps_ms != null
                  ? `<span class="temps" style="font-size:13px">${formatTemps(p.temps_ms)}</span>`
                  : '<span style="color:var(--texte-3)">—</span>'}</td>
              <td>
                <div class="actions">
                  <button class="btn-icone" data-deplacer="${p.participant_id}" title="Déplacer vers une autre course">⇄</button>
                  <button class="btn-icone" data-editer="${p.participant_id}" title="Modifier">✎</button>
                  <button class="btn-icone" data-supprimer="${p.participant_id}" title="Retirer">🗑</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `
    <div class="vide">
      <div class="vide-titre">Aucun participant</div>
      <p>${etat.courses.length
        ? 'Ajoute des participants à une course, depuis une inscription validée ou à la main.'
        : 'Crée d’abord une course.'}</p>
    </div>`}`;

  brancherRecherche();

  $('#f-course').onchange = (e) => { etat.filtres.course = e.target.value; dessiner(); };
  $('#btn-ajouter').onclick = () => modaleParticipant(null);
  $('#btn-csv').onclick = () => exporterCSV('participants', [
    { titre: 'Course', valeur: (p) => p.course_nom },
    { titre: 'Date', valeur: (p) => formatDateCourte(p.date_course) },
    { titre: 'Dossard', valeur: (p) => p.dossard ?? '' },
    { titre: 'Ordre de départ', valeur: (p) => p.ordre_depart ?? '' },
    { titre: 'Participant', valeur: (p) => p.participant_nom },
    { titre: 'Pilotes', valeur: (p) => p.pilotes ?? '' },
    { titre: 'Entreprise', valeur: (p) => p.entreprise_nom ?? '' },
    { titre: 'Position', valeur: (p) => p.position ?? '' },
    { titre: 'Temps', valeur: (p) => (p.abandon ? 'ABANDON' : p.temps_ms != null ? formatTemps(p.temps_ms) : '') },
  ], lignes);

  $$('[data-editer]').forEach((b) => {
    b.onclick = () => modaleParticipant(etat.participants.find((p) => p.participant_id === b.dataset.editer));
  });

  $$('[data-deplacer]').forEach((b) => {
    b.onclick = () => modaleDeplacer(etat.participants.find((p) => p.participant_id === b.dataset.deplacer));
  });

  $$('[data-supprimer]').forEach((b) => {
    b.onclick = async () => {
      const p = etat.participants.find((x) => x.participant_id === b.dataset.supprimer);
      const chrono = p.temps_ms != null || p.abandon;
      if (await confirmer({
        titre: 'Retirer le participant',
        message: `<strong>${echapper(p.participant_nom)}</strong> sera retiré de
          <strong>${echapper(p.course_nom)}</strong>.
          ${chrono ? '<br><br>Son résultat sera supprimé et le classement recalculé.' : ''}
          <br><br>L'inscription, elle, est conservée.`,
        bouton: 'Retirer',
      })) {
        const { error } = await db.from('participants').delete().eq('id', p.participant_id);
        if (error) notifier(messageErreur(error), 'erreur');
        else { notifier('Participant retiré', 'succes'); await rafraichir(); }
      }
    };
  });
}

/* « Prénom Nom » en solo, « Prénom Nom & Prénom Nom » à deux.
   Les téléphones ne sortent jamais d'ici : la colonne est publique. */
function pilotesDepuisInscription(i) {
  const p1 = `${i.prenom} ${i.nom}`.trim();
  const p2 = i.p2_prenom && i.p2_nom ? `${i.p2_prenom} ${i.p2_nom}`.trim() : '';
  return p2 ? `${p1} & ${p2}` : p1;
}

function modaleParticipant(participant) {
  const nouveau = !participant;

  // Inscriptions validées pas encore engagées : le rattachement évite
  // de retaper les noms et garde le lien avec la décharge.
  const engagees = new Set(etat.participants.map((p) => p.inscription_id).filter(Boolean));
  const dispo = etat.inscriptions.filter((i) => i.statut === 'validee' && !engagees.has(i.id));

  ouvrirModale({
    titre: nouveau ? 'Ajouter un participant' : 'Modifier le participant',
    contenu: `
      ${nouveau && dispo.length ? `
      <div class="champ">
        <label for="p-inscription">Depuis une inscription validée</label>
        <select id="p-inscription">
          <option value="">— Saisie manuelle —</option>
          ${dispo.map((i) => `<option value="${i.id}"
            data-nom="${echapper(i.nom_equipe)}" data-ent="${i.entreprise_id ?? ''}"
            data-pilotes="${echapper(pilotesDepuisInscription(i))}">
            ${echapper(i.nom_equipe)} — ${echapper(i.prenom)} ${echapper(i.nom)}</option>`).join('')}
        </select>
        <p class="aide">${dispo.length} inscription(s) validée(s) pas encore engagée(s).</p>
      </div>` : ''}

      <div class="champ">
        <label for="p-course">Course *</label>
        <select id="p-course">${optionsCourses(participant?.course_id)}</select>
      </div>

      <div class="champ">
        <label for="p-nom">Nom d'équipe *</label>
        <input type="text" id="p-nom" value="${echapper(participant?.participant_nom ?? '')}" maxlength="60">
        <p class="aide">Annoncé et affiché en gros au classement.</p>
      </div>

      <div class="champ">
        <label for="p-pilotes">Pilotes</label>
        <input type="text" id="p-pilotes" value="${echapper(participant?.pilotes ?? '')}" maxlength="80"
               placeholder="Prénom Nom & Prénom Nom">
        <p class="aide">Affiché en petit sous le nom d'équipe, côté public.
           Rempli tout seul depuis l'inscription. ⚠️ Jamais de téléphone ici.</p>
      </div>

      <div class="champ">
        <label for="p-entreprise">Entreprise</label>
        <select id="p-entreprise">${optionsEntreprises(participant?.entreprise_id)}</select>
      </div>

      <div class="grille grille-2">
        <div class="champ">
          <label for="p-dossard">Dossard</label>
          <input type="number" id="p-dossard" value="${participant?.dossard ?? ''}" min="1" max="999">
          <p class="aide">Unique par course.</p>
        </div>
        <div class="champ">
          <label for="p-ordre">Ordre de départ</label>
          <input type="number" id="p-ordre" value="${participant?.ordre_depart ?? ''}" min="1" max="999">
        </div>
      </div>

      <p class="erreur-champ" id="p-erreur" hidden></p>`,

    onValider: async (corps) => {
      const err = $('#p-erreur', corps);
      const nom = $('#p-nom', corps).value.trim();
      const course_id = $('#p-course', corps).value;

      if (!nom || !course_id) {
        err.hidden = false;
        err.textContent = 'La course et le nom affiché sont obligatoires.';
        return false;
      }

      const donnees = {
        course_id, nom,
        pilotes: $('#p-pilotes', corps).value.trim() || null,
        entreprise_id: $('#p-entreprise', corps).value || null,
        dossard: $('#p-dossard', corps).value ? Number($('#p-dossard', corps).value) : null,
        ordre_depart: $('#p-ordre', corps).value ? Number($('#p-ordre', corps).value) : null,
      };
      if (nouveau) donnees.inscription_id = $('#p-inscription', corps)?.value || null;

      const { error } = nouveau
        ? await db.from('participants').insert(donnees)
        : await db.from('participants').update(donnees).eq('id', participant.participant_id);

      if (error) { err.hidden = false; err.textContent = messageErreur(error); return false; }
      notifier(nouveau ? 'Participant ajouté' : 'Participant modifié', 'succes');
      await rafraichir();
      return true;
    },
  });

  // Choisir une inscription pré-remplit le nom et l'entreprise.
  const sel = $('#p-inscription');
  if (sel) {
    sel.onchange = () => {
      const opt = sel.selectedOptions[0];
      if (!opt.value) return;
      $('#p-nom').value = opt.dataset.nom;
      $('#p-pilotes').value = opt.dataset.pilotes || '';
      $('#p-entreprise').value = opt.dataset.ent || '';
    };
  }
}

function modaleDeplacer(p) {
  ouvrirModale({
    titre: 'Déplacer le participant',
    bouton: 'Déplacer',
    contenu: `
      <p style="color:var(--texte-2);font-size:15px;margin-bottom:20px">
        <strong style="color:var(--texte)">${echapper(p.participant_nom)}</strong>
        quitte <strong style="color:var(--texte)">${echapper(p.course_nom)}</strong>.
      </p>
      <div class="champ">
        <label for="d-course">Course de destination *</label>
        <select id="d-course">
          ${trierCourses(etat.courses).filter((c) => c.id !== p.course_id)
            .map((c) => `<option value="${c.id}">${echapper(c.nom)} — ${formatHeure(c.heure_depart)}</option>`).join('')}
        </select>
      </div>
      <div class="champ">
        <label for="d-dossard">Dossard sur la nouvelle course</label>
        <input type="number" id="d-dossard" value="${p.dossard ?? ''}" min="1" max="999">
        <p class="aide">Laisse vide si le dossard est déjà pris sur la course d'arrivée.</p>
      </div>
      ${p.temps_ms != null || p.abandon ? `
        <p class="erreur-champ" style="margin-top:8px">
          Ce participant a un résultat enregistré. Il suivra le déplacement et sera
          classé sur la course de destination.
        </p>` : ''}
      <p class="erreur-champ" id="d-erreur" hidden></p>`,

    onValider: async (corps) => {
      const err = $('#d-erreur', corps);
      const dossard = $('#d-dossard', corps).value;

      const { error } = await db.from('participants').update({
        course_id: $('#d-course', corps).value,
        dossard: dossard ? Number(dossard) : null,
      }).eq('id', p.participant_id);

      if (error) { err.hidden = false; err.textContent = messageErreur(error); return false; }
      notifier('Participant déplacé', 'succes');
      await rafraichir();
      return true;
    },
  });
}


/* =====================================================================
   8. RÉSULTATS
   Pas de chronomètre : le chronométrage se fait ailleurs. On saisit,
   on relit, on publie.
   ===================================================================== */

function vueResultats() {
  const courses = trierCourses(etat.courses).filter((c) => c.statut !== 'annulee');
  const parCourse = grouperParCourse(etat.participants);

  $('#vue').innerHTML = `
    <p class="aide" style="margin-bottom:18px">
      Saisis un temps (<code>2:47.320</code>, <code>2:47</code> ou <code>1:02:47</code>) ou coche Abandon.
      Chaque case s'enregistre en sortant du champ. Rien n'est visible du public tant que
      les résultats ne sont pas publiés.
    </p>

    ${courses.length ? courses.map((c) => blocSaisie(c, trierClassement(parCourse.get(c.id) ?? []))).join('') : `
    <div class="vide">
      <div class="vide-titre">Aucune course</div>
      <p>Crée une course et engage des participants avant de saisir des temps.</p>
    </div>`}`;

  brancherSaisie();
}

function blocSaisie(c, lignes) {
  const saisis = lignes.filter((l) => l.temps_ms != null || l.abandon).length;
  const total = lignes.length;

  return `
  <div class="saisie-course">
    <div class="saisie-tete">
      <span class="pastille ${c.statutAffiche}">${LIBELLE_STATUT[c.statutAffiche]}</span>
      <div style="flex:1;min-width:0">
        <div class="saisie-nom">${echapper(c.nom)}</div>
        <div style="font-size:12px;color:var(--texte-3);margin-top:2px">
          ${formatDateCourte(c.date_course)} · ${formatHeure(c.heure_depart)} ·
          ${saisis}/${total} temps saisi(s)
        </div>
      </div>
    </div>

    ${total ? lignes.map((l) => `
      <div class="saisie-ligne ${l.abandon ? 'abandonne' : ''}" data-participant="${l.participant_id}">
        <span class="dossard">${l.dossard ?? '—'}</span>
        <span class="saisie-participant">${echapper(l.participant_nom)}
          ${l.entreprise_nom ? `<span style="color:var(--texte-3);font-weight:400"> · ${echapper(l.entreprise_nom)}</span>` : ''}
          ${l.pilotes ? `<div class="pilotes">${echapper(l.pilotes)}</div>` : ''}
        </span>
        <input type="text" class="chrono-saisie saisie-champ" data-temps="${l.participant_id}"
               value="${l.abandon ? '' : (l.temps_ms != null ? formatTemps(l.temps_ms) : '')}"
               placeholder="MM:SS.mmm" ${l.abandon ? 'disabled' : ''}>
        <label class="ligne" style="gap:6px;font-size:11px;color:var(--texte-3);cursor:pointer">
          <input type="checkbox" data-abandon="${l.participant_id}" ${l.abandon ? 'checked' : ''}
                 style="width:15px;height:15px;accent-color:var(--danger)">
          Abandon
        </label>
      </div>`).join('')
    : '<p style="padding:24px;text-align:center;color:var(--texte-3);font-size:14px">Aucun participant engagé.</p>'}

    <div class="verrou ${c.resultats_publies ? 'ouvert' : 'ferme'}">
      <span>${c.resultats_publies
        ? '● Résultats publiés — visibles du public et de l’écran géant'
        : '● Résultats non publiés — invisibles du public'}</span>
      <button class="btn btn-mini ${c.resultats_publies ? '' : 'btn-or'} pousse"
              data-publier="${c.id}" ${total ? '' : 'disabled'}>
        ${c.resultats_publies ? 'Dépublier' : 'Publier les résultats'}
      </button>
    </div>
  </div>`;
}

function brancherSaisie() {
  // Enregistrement à la sortie du champ, pas à chaque frappe : sinon on
  // écrit « 2 », « 2: », « 2:4 »… en base à chaque touche.
  $$('[data-temps]').forEach((input) => {
    input.onblur = () => enregistrerTemps(input);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        input.blur();
        // Enchaîner sur le participant suivant : la saisie se fait au
        // clavier, sans lâcher la feuille de chrono.
        const tous = [...$$('[data-temps]')].filter((i) => !i.disabled);
        tous[tous.indexOf(input) + 1]?.focus();
      }
      if (e.key === 'Escape') { input.value = input.dataset.avant ?? input.value; input.blur(); }
    };
    input.onfocus = () => { input.dataset.avant = input.value; };
  });

  $$('[data-abandon]').forEach((cb) => {
    cb.onchange = async () => {
      const id = cb.dataset.abandon;
      const { error } = cb.checked
        ? await db.from('resultats').upsert(
            { participant_id: id, temps_ms: null, abandon: true, saisi_par: etat.profil.id },
            { onConflict: 'participant_id' })
        : await db.from('resultats').delete().eq('participant_id', id);

      if (error) { notifier(messageErreur(error), 'erreur'); cb.checked = !cb.checked; }
      else await rafraichir();
    };
  });

  $$('[data-publier]').forEach((b) => {
    b.onclick = () => basculerPublication(b.dataset.publier);
  });
}

async function enregistrerTemps(input) {
  const id = input.dataset.temps;
  const saisie = input.value.trim();
  const actuel = etat.participants.find((p) => p.participant_id === id);

  // Champ vidé : on efface le résultat.
  if (!saisie) {
    if (actuel?.temps_ms == null && !actuel?.abandon) return;
    const { error } = await db.from('resultats').delete().eq('participant_id', id);
    if (error) notifier(messageErreur(error), 'erreur');
    else await rafraichir();
    return;
  }

  const ms = parseTemps(saisie);
  if (ms === null) {
    input.setAttribute('aria-invalid', 'true');
    notifier(`« ${saisie} » n'est pas un temps valide. Format attendu : 2:47.320`, 'erreur');
    return;
  }
  input.removeAttribute('aria-invalid');

  if (ms === actuel?.temps_ms) return;   // rien n'a changé

  const { error } = await db.from('resultats').upsert(
    { participant_id: id, temps_ms: ms, abandon: false, saisi_par: etat.profil.id },
    { onConflict: 'participant_id' });

  if (error) notifier(messageErreur(error), 'erreur');
  else {
    input.value = formatTemps(ms);   // normalise l'affichage
    await rafraichir();
  }
}

async function basculerPublication(courseId) {
  const c = etat.courses.find((x) => x.id === courseId);
  const lignes = grouperParCourse(etat.participants).get(courseId) ?? [];
  const manquants = lignes.filter((l) => l.temps_ms == null && !l.abandon);

  if (c.resultats_publies) {
    if (!await confirmer({
      titre: 'Dépublier les résultats',
      message: `Les temps de <strong>${echapper(c.nom)}</strong> disparaîtront immédiatement
        du site public et de l'écran géant.<br><br>
        À n'utiliser qu'en cas d'erreur de saisie constatée après publication.`,
      bouton: 'Dépublier',
    })) return;
  } else {
    if (!await confirmer({
      titre: 'Publier les résultats',
      message: `Les temps de <strong>${echapper(c.nom)}</strong> deviennent visibles
        de tout le monde, immédiatement, sans rechargement.<br><br>
        ${manquants.length
          ? `<span style="color:var(--s-prochaine)">⚠ ${manquants.length} participant(s) sans temps ni abandon :
             ${manquants.map((m) => echapper(m.participant_nom)).join(', ')}.
             Ils apparaîtront sans résultat.</span>`
          : `<span style="color:var(--succes)">Les ${lignes.length} participants ont un temps ou un abandon.</span>`}`,
      bouton: 'Publier',
      danger: false,
    })) return;
  }

  const { error } = await db.from('courses')
    .update({ resultats_publies: !c.resultats_publies }).eq('id', courseId);

  if (error) notifier(messageErreur(error), 'erreur');
  else {
    notifier(c.resultats_publies ? 'Résultats dépubliés' : 'Résultats publiés', 'succes');
    await rafraichir();
  }
}


/* =====================================================================
   9. CLASSEMENTS
   Vue staff : elle montre aussi les temps non publiés, signalés comme
   tels. C'est la relecture avant publication.
   ===================================================================== */

function vueClassements() {
  const { course, entreprise, statut: type } = etat.filtres;

  let lignes = etat.participants.filter((l) => l.temps_ms != null || l.abandon);
  if (course) lignes = lignes.filter((l) => l.course_id === course);
  if (entreprise) lignes = lignes.filter((l) => l.entreprise_id === entreprise);
  if (type) lignes = lignes.filter((l) => l.course_type === type);

  const triees = trierClassement(lignes);
  const meilleur = triees.find((l) => l.temps_ms != null)?.temps_ms ?? null;
  let rang = 0, dernierTemps = null, dernierRang = 0;

  $('#vue').innerHTML = `
    <div class="outils">
      <select id="f-course" style="width:auto">
        <option value="">Toutes les courses</option>${optionsCourses(course)}
      </select>
      <select id="f-statut" style="width:auto">
        <option value="">Tous types</option>
        <option value="publique" ${type === 'publique' ? 'selected' : ''}>Courses publiques</option>
        <option value="entreprise" ${type === 'entreprise' ? 'selected' : ''}>Courses entreprises</option>
      </select>
      <select id="f-entreprise" style="width:auto">
        <option value="">Toutes entreprises</option>
        ${etat.entreprises.map((e) => `<option value="${e.id}" ${e.id === entreprise ? 'selected' : ''}>${echapper(e.nom)}</option>`).join('')}
      </select>
      <button class="btn btn-mini pousse" id="btn-csv">Exporter CSV</button>
      <button class="btn btn-mini" id="btn-imprimer">Imprimer</button>
    </div>

    ${triees.length ? `
    <div class="panneau">
      <table class="classement">
        <thead>
          <tr><th style="width:54px">Pos.</th><th style="width:54px">N°</th><th>Participant</th>
              <th>Entreprise</th><th>Course</th><th style="text-align:right">Temps</th></tr>
        </thead>
        <tbody>
          ${triees.map((l) => {
            let pos = null;
            if (!l.abandon && l.temps_ms != null) {
              rang++;
              pos = l.temps_ms === dernierTemps ? dernierRang : rang;
              dernierTemps = l.temps_ms; dernierRang = pos;
            }
            const ecart = l.abandon ? '' : formatEcart(l.temps_ms, meilleur);
            return `
            <tr class="${l.abandon ? 'est-abandon' : ''} ${pos ? `rang-${pos}` : ''}" data-cle="a-${l.participant_id}">
              <td class="pos">${pos ?? '—'}</td>
              <td><span class="dossard">${l.dossard ?? '—'}</span></td>
              <td>${celluleEquipe(l)}</td>
              <td style="color:var(--texte-2);font-size:13px">${echapper(l.entreprise_nom ?? '—')}</td>
              <td style="font-size:13px;color:var(--texte-2)">
                ${echapper(l.course_nom)}
                ${l.resultats_publies ? '' : '<span class="mini-badge attente" style="margin-left:6px">Non publié</span>'}
              </td>
              <td style="text-align:right">
                ${l.abandon ? '<span class="abandon-tag">Abandon</span>'
                  : `<span class="temps">${formatTemps(l.temps_ms)}</span>
                     ${ecart ? `<div style="font-size:11px;color:var(--texte-3);font-family:var(--f-chrono)">${ecart}</div>` : ''}`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="aide" style="margin-top:16px">
        ${triees.filter((l) => !l.abandon).length} temps ·
        ${triees.filter((l) => l.abandon).length} abandon(s) ·
        ${triees.filter((l) => !l.resultats_publies).length} non publié(s)
      </p>
    </div>` : `
    <div class="vide">
      <div class="vide-titre">Aucun temps</div>
      <p>Les classements se remplissent au fur et à mesure de la saisie des résultats.</p>
    </div>`}`;

  $('#f-course').onchange = (e) => { etat.filtres.course = e.target.value; dessiner(); };
  $('#f-statut').onchange = (e) => { etat.filtres.statut = e.target.value; dessiner(); };
  $('#f-entreprise').onchange = (e) => { etat.filtres.entreprise = e.target.value; dessiner(); };
  $('#btn-imprimer').onclick = () => window.print();
  $('#btn-csv').onclick = () => exporterCSV('classement', [
    { titre: 'Course', valeur: (l) => l.course_nom },
    { titre: 'Date', valeur: (l) => formatDateCourte(l.date_course) },
    { titre: 'Position', valeur: (l) => l.position ?? '' },
    { titre: 'Dossard', valeur: (l) => l.dossard ?? '' },
    { titre: 'Participant', valeur: (l) => l.participant_nom },
    { titre: 'Pilotes', valeur: (l) => l.pilotes ?? '' },
    { titre: 'Entreprise', valeur: (l) => l.entreprise_nom ?? '' },
    { titre: 'Temps', valeur: (l) => (l.abandon ? 'ABANDON' : formatTemps(l.temps_ms)) },
    { titre: 'Millisecondes', valeur: (l) => l.temps_ms ?? '' },
    { titre: 'Publié', valeur: (l) => (l.resultats_publies ? 'Oui' : 'Non') },
  ], triees);
}


/* =====================================================================
   10. HISTORIQUE
   ===================================================================== */

const LIBELLE_ACTION = {
  creation: 'a créé', modification: 'a modifié', suppression: 'a supprimé',
  publication_resultats: 'a publié les résultats de',
  depublication_resultats: 'a dépublié les résultats de',
};

const LIBELLE_ENTITE = {
  courses: 'la course', participants: 'le participant',
  resultats: 'le résultat de', inscriptions: "l'inscription",
};

function vueHistorique() {
  const { recherche } = etat.filtres;
  let lignes = etat.historique;
  if (recherche) {
    lignes = lignes.filter((h) => [h.user_nom, h.libelle, h.entite, h.action]
      .filter(Boolean).join(' ').toLowerCase().includes(recherche));
  }

  $('#vue').innerHTML = `
    <div class="outils">
      <div class="recherche"><input type="text" id="f-recherche" placeholder="Auteur, action, élément…"></div>
      <button class="btn btn-mini pousse" id="btn-csv">Exporter CSV</button>
    </div>

    <p class="aide" style="margin-bottom:18px">
      200 dernières actions. Le journal est alimenté par la base elle-même :
      il n'est modifiable par personne, pas même par un administrateur.
    </p>

    ${lignes.length ? `
    <div class="panneau">
      <div class="journal">
        ${lignes.map((h) => `
          <div class="journal-item ${h.action}">
            <div class="journal-tete">
              <span class="journal-qui">${echapper(h.user_nom)}</span>
              <span class="journal-action">
                ${LIBELLE_ACTION[h.action] ?? h.action}
                ${LIBELLE_ENTITE[h.entite] ?? h.entite}
                ${h.libelle ? `<strong style="color:var(--texte)">${echapper(h.libelle)}</strong>` : ''}
              </span>
              <span class="journal-quand">${formatDateHeure(h.created_at)}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>` : `
    <div class="vide">
      <div class="vide-titre">Journal vide</div>
      <p>${etat.historique.length ? 'Aucune action ne correspond à cette recherche.' : 'Aucune action enregistrée.'}</p>
    </div>`}`;

  brancherRecherche();
  $('#btn-csv').onclick = () => exporterCSV('historique', [
    { titre: 'Date', valeur: (h) => formatDateHeure(h.created_at) },
    { titre: 'Administrateur', valeur: (h) => h.user_nom },
    { titre: 'Action', valeur: (h) => h.action },
    { titre: 'Élément', valeur: (h) => h.entite },
    { titre: 'Libellé', valeur: (h) => h.libelle ?? '' },
  ], lignes);
}


/* =====================================================================
   11. PARAMÈTRES — administrateurs uniquement
   ===================================================================== */

function vueParametres() {
  if (!estAdmin()) {
    $('#vue').innerHTML = `
      <div class="vide">
        <div class="vide-titre">Accès réservé</div>
        <p>Les paramètres du site sont réservés aux administrateurs.
           Ton compte est un compte opérateur.</p>
      </div>`;
    return;
  }

  $('#vue').innerHTML = `
    <div class="panneau" style="margin-bottom:20px">
      <h2 class="titre-section">Comptes</h2>
      <p class="aide" style="margin-bottom:16px">
        Les comptes se créent dans Supabase → Authentication → Users (avec
        <em>Auto Confirm User</em>). Ils arrivent ici en opérateur ; tu les promeus ensuite.
        Les mots de passe sont chiffrés par Supabase et ne sont visibles nulle part.
      </p>
      <div class="tbl-enveloppe">
        <table class="tbl">
          <thead><tr><th>Nom</th><th>Identifiant</th><th>Rôle</th><th>État</th><th></th></tr></thead>
          <tbody>
            ${etat.profils.map((p) => `
              <tr>
                <td style="font-weight:600">${echapper(p.nom)}
                  ${p.id === etat.profil.id ? '<span class="mini-badge or" style="margin-left:6px">Toi</span>' : ''}</td>
                <td style="font-size:13px;color:var(--texte-2)">${echapper(p.email)}</td>
                <td>
                  <select data-role="${p.id}" style="width:auto;padding:5px 8px;font-size:12px"
                          ${p.id === etat.profil.id ? 'disabled title="Tu ne peux pas changer ton propre rôle"' : ''}>
                    <option value="operateur" ${p.role === 'operateur' ? 'selected' : ''}>Opérateur</option>
                    <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Administrateur</option>
                  </select>
                </td>
                <td><span class="mini-badge ${p.actif ? 'ok' : 'ko'}">${p.actif ? 'Actif' : 'Désactivé'}</span></td>
                <td><div class="actions">
                  ${p.id === etat.profil.id ? '' : `
                    <button class="btn btn-mini" data-actif="${p.id}">
                      ${p.actif ? 'Désactiver' : 'Réactiver'}
                    </button>`}
                </div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panneau">
      <div class="ligne" style="margin-bottom:16px">
        <h2 class="titre-section" style="margin:0;border:none;padding:0">Entreprises</h2>
        <button class="btn btn-or btn-mini pousse" id="btn-entreprise">+ Entreprise</button>
      </div>
      <p class="aide" style="margin-bottom:16px">
        Cette liste alimente le formulaire public et les filtres de classement.
      </p>
      ${etat.entreprises.length ? `
      <div class="tbl-enveloppe">
        <table class="tbl" style="min-width:auto">
          <thead><tr><th>Nom</th><th>Engagés</th><th>État</th><th></th></tr></thead>
          <tbody>
            ${etat.entreprises.map((e) => {
              const nb = etat.participants.filter((p) => p.entreprise_id === e.id).length;
              return `
              <tr>
                <td style="font-weight:600">
                  <span style="display:inline-block;width:9px;height:9px;border-radius:50%;
                        background:${e.couleur ?? 'var(--trait-2)'};margin-right:8px"></span>
                  ${echapper(e.nom)}
                </td>
                <td style="color:var(--texte-2)">${nb}</td>
                <td><span class="mini-badge ${e.active ? 'ok' : ''}">${e.active ? 'Active' : 'Masquée'}</span></td>
                <td><div class="actions">
                  <button class="btn-icone" data-ent-editer="${e.id}" title="Modifier">✎</button>
                  <button class="btn-icone" data-ent-supprimer="${e.id}" title="Supprimer">🗑</button>
                </div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p style="color:var(--texte-3);font-size:14px">Aucune entreprise enregistrée.</p>'}
    </div>`;

  $$('[data-role]').forEach((sel) => {
    sel.onchange = async () => {
      const { error } = await db.from('profils').update({ role: sel.value }).eq('id', sel.dataset.role);
      if (error) { notifier(messageErreur(error), 'erreur'); await rafraichir(); }
      else { notifier('Rôle modifié', 'succes'); await rafraichir(); }
    };
  });

  $$('[data-actif]').forEach((b) => {
    b.onclick = async () => {
      const p = etat.profils.find((x) => x.id === b.dataset.actif);
      if (p.actif && !await confirmer({
        titre: 'Désactiver le compte',
        message: `<strong>${echapper(p.nom)}</strong> ne pourra plus accéder à l'espace
          organisation. Ses actions passées restent dans l'historique.`,
        bouton: 'Désactiver',
      })) return;

      const { error } = await db.from('profils').update({ actif: !p.actif }).eq('id', p.id);
      if (error) notifier(messageErreur(error), 'erreur');
      else { notifier(p.actif ? 'Compte désactivé' : 'Compte réactivé', 'succes'); await rafraichir(); }
    };
  });

  $('#btn-entreprise').onclick = () => modaleEntreprise(null);

  $$('[data-ent-editer]').forEach((b) => {
    b.onclick = () => modaleEntreprise(etat.entreprises.find((e) => e.id === b.dataset.entEditer));
  });

  $$('[data-ent-supprimer]').forEach((b) => {
    b.onclick = async () => {
      const e = etat.entreprises.find((x) => x.id === b.dataset.entSupprimer);
      const nb = etat.participants.filter((p) => p.entreprise_id === e.id).length;
      if (await confirmer({
        titre: 'Supprimer l’entreprise',
        message: `<strong>${echapper(e.nom)}</strong>
          ${nb ? `<br><br>${nb} participant(s) y sont rattachés. Ils seront conservés mais perdront
            leur entreprise.<br><br>Pour la retirer du formulaire sans casser les rattachements,
            passe-la en <em>Masquée</em>.` : ''}`,
      })) {
        const { error } = await db.from('entreprises').delete().eq('id', e.id);
        if (error) notifier(messageErreur(error), 'erreur');
        else { notifier('Entreprise supprimée', 'succes'); await rafraichir(); }
      }
    };
  });
}

function modaleEntreprise(entreprise) {
  const nouvelle = !entreprise;
  const e = entreprise ?? { active: true, couleur: '#D4AF37' };

  ouvrirModale({
    titre: nouvelle ? 'Nouvelle entreprise' : 'Modifier l’entreprise',
    contenu: `
      <div class="champ">
        <label for="e-nom">Nom *</label>
        <input type="text" id="e-nom" value="${echapper(e.nom ?? '')}" maxlength="80">
      </div>
      <div class="champ">
        <label for="e-couleur">Couleur</label>
        <input type="text" id="e-couleur" value="${echapper(e.couleur ?? '')}"
               placeholder="#D4AF37" maxlength="7">
        <p class="aide">Repère visuel dans les classements. Format hexadécimal.</p>
      </div>
      <label class="case"><input type="checkbox" id="e-active" ${e.active ? 'checked' : ''}>
        <span>Proposée dans le formulaire d'inscription</span></label>
      <p class="erreur-champ" id="e-erreur" hidden></p>`,

    onValider: async (corps) => {
      const err = $('#e-erreur', corps);
      const nom = $('#e-nom', corps).value.trim();
      if (!nom) { err.hidden = false; err.textContent = 'Le nom est obligatoire.'; return false; }

      const donnees = {
        nom,
        couleur: $('#e-couleur', corps).value.trim() || null,
        active: $('#e-active', corps).checked,
      };

      const { error } = nouvelle
        ? await db.from('entreprises').insert(donnees)
        : await db.from('entreprises').update(donnees).eq('id', e.id);

      if (error) { err.hidden = false; err.textContent = messageErreur(error); return false; }
      notifier(nouvelle ? 'Entreprise ajoutée' : 'Entreprise modifiée', 'succes');
      await rafraichir();
      return true;
    },
  });
}


demarrer();
