/* =====================================================================
   SITE PUBLIC
   Onglets : inscription · programme des courses · classement général.
   Tout se met à jour sans rechargement, via Supabase Realtime.
   ===================================================================== */

import {
  db, chargerCourses, chargerParticipants, chargerEntreprises, chargerClassementGeneral,
  inscriptionsOuvertes,
  grouperParCourse, trierCourses, trierClassement, ecouter, surReveil, debounce,
  formatTemps, formatEcart, formatDate, formatDateCourte, formatHeure,
  LIBELLE_STATUT, LIBELLE_TYPE, echapper, celluleEquipe, notifier, messageErreur,
  memoriserPositions, animerVersNouvellesPositions,
} from './api.js';
import { EVENEMENT } from './config.js';

/* État local — reflet de la base, jamais la source de vérité. */
const etat = {
  courses: [],
  participants: [],
  entreprises: [],
  general: [],
  ouvertes: new Set(),   // ids des courses dépliées
  categorie: 'solo',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);


/* =====================================================================
   1. DÉMARRAGE
   ===================================================================== */

async function demarrer() {
  appliquerConfig();
  brancherOnglets();
  brancherFormulaire();
  brancherFiltres();

  await rafraichir();

  // Temps réel : la moindre écriture en base redessine les vues.
  const redessiner = debounce(rafraichir, 200);
  ecouter(
    ['courses', 'participants', 'resultats', 'entreprises', 'parametres'],
    redessiner,
    (connecte) => {
      const t = $('#temoin-direct');
      t.classList.toggle('actif', connecte);
      t.textContent = connecte ? 'En direct' : 'Hors ligne';
    },
  );

  // Un onglet mis en veille perd son WebSocket sans prévenir.
  surReveil(rafraichir);
}

function appliquerConfig() {
  $('#sous-titre').textContent = `${EVENEMENT.lieu} — ${EVENEMENT.date}`;
  $('#pied-event').textContent = `${EVENEMENT.nom} — ${EVENEMENT.organisation}`;
  // Le reglement est dans le site, pas derriere un lien externe : on
  // ouvre la fenetre au lieu de naviguer. Import a la demande — un
  // fichier de 39 articles n'a pas a etre charge pour afficher le
  // programme des courses.
  $('#lien-reglement').onclick = async (e) => {
    e.preventDefault();
    try {
      const { ouvrirReglement } = await import('./reglement.js');
      ouvrirReglement();
    } catch {
      notifier('Règlement momentanément indisponible (assets/reglement.js).', 'erreur');
    }
  };
  $('#lien-decharge').href = EVENEMENT.lienDecharge;
  $('#lien-intranet').href = EVENEMENT.lienIntranet;
  const li = $('#lien-intranet-ferme');
  if (li) li.href = EVENEMENT.lienIntranet;
  document.title = `${EVENEMENT.nom} — ${EVENEMENT.lieu} | ${EVENEMENT.organisation}`;
}

async function rafraichir() {
  try {
    const [courses, participants, entreprises, general, ouvertes] = await Promise.all([
      chargerCourses(),
      chargerParticipants(),
      chargerEntreprises(),
      chargerClassementGeneral(),
      inscriptionsOuvertes(),
    ]);
    etat.courses = courses;
    etat.participants = participants;
    etat.entreprises = entreprises;
    etat.general = general;
    etat.inscriptionsOuvertes = ouvertes;
    majEtatInscriptions();

    dessinerCourses();
    dessinerGeneral();
    remplirSelects();
  } catch (e) {
    notifier(messageErreur(e), 'erreur');
  }
}


/* =====================================================================
   2. ONGLETS
   ===================================================================== */

function brancherOnglets() {
  $$('.onglet').forEach((btn) => {
    btn.onclick = () => afficherOnglet(btn.dataset.onglet);
  });

  // Lien direct : index.html#courses
  const cible = location.hash.slice(1);
  if (['inscription', 'courses', 'classement'].includes(cible)) afficherOnglet(cible);
}

function majEtatInscriptions() {
  const form = document.querySelector('#inscription-form');
  const ok = document.querySelector('#inscription-ok');
  const ferme = document.querySelector('#inscription-fermee');
  if (!ferme) return;

  if (etat.inscriptionsOuvertes) {
    ferme.hidden = true;
    // On ne réaffiche le formulaire que si on n'est pas sur l'écran
    // de confirmation d'un envoi réussi.
    if (ok.hidden) form.hidden = false;
  } else {
    form.hidden = true;
    ok.hidden = true;
    ferme.hidden = false;
  }
}

function afficherOnglet(nom) {
  $$('.onglet').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.onglet === nom)));
  ['inscription', 'courses', 'classement'].forEach((v) => {
    $(`#vue-${v}`).hidden = v !== nom;
  });
  history.replaceState(null, '', `#${nom}`);
}


/* =====================================================================
   3. FORMULAIRE D'INSCRIPTION
   ===================================================================== */

function brancherFormulaire() {
  $$('.cat').forEach((btn) => {
    btn.onclick = () => {
      etat.categorie = btn.dataset.cat;
      $$('.cat').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      // Duo et entreprise engagent deux personnes ; solo, une seule.
      $('#bloc-p2').hidden = etat.categorie === 'solo';
      $('#bloc-entreprise').hidden = etat.categorie !== 'entreprise';

      // A deux, un seul Discord suffit : le dire, plutot que de laisser
      // l'etoile obligatoire faire croire aux deux.
      $('#aide-discord').textContent = etat.categorie === 'solo'
        ? "Ton @ sert à t'ajouter au salon Participants de l'Intranet : c'est là que passent toutes les informations de la course. Pas encore sur le Discord de la Mairie ? Le bouton t'y emmène."
        : "Au moins un des deux. Chaque @ renseigné est ajouté au salon Participants de l'Intranet, où passent toutes les informations de la course — donnez les deux pour que personne ne rate rien.";
    };
  });

  $('#btn-inscrire').onclick = envoyerInscription;

  $('#btn-nouvelle-inscription').onclick = () => {
    $('#inscription-ok').hidden = true;
    $('#inscription-form').hidden = false;
    viderFormulaire();
  };
}

function remplirSelects() {
  // Entreprises du formulaire
  const sel = $('#i-entreprise');
  const garde = sel.value;
  sel.innerHTML = '<option value="">— Sélectionner —</option>' +
    etat.entreprises
      .filter((e) => e.active)
      .map((e) => `<option value="${e.id}">${echapper(e.nom)}</option>`)
      .join('');
  sel.value = garde;

  // Filtres du classement général
  const fc = $('#f-course');
  const gardeC = fc.value;
  fc.innerHTML = '<option value="">Toutes</option>' +
    trierCourses(etat.courses)
      .map((c) => `<option value="${c.id}">${echapper(c.nom)}</option>`)
      .join('');
  fc.value = gardeC;

  const fe = $('#f-entreprise');
  const gardeE = fe.value;
  fe.innerHTML = '<option value="">Toutes</option>' +
    etat.entreprises.map((e) => `<option value="${e.id}">${echapper(e.nom)}</option>`).join('');
  fe.value = gardeE;

  const fd = $('#f-date');
  const gardeD = fd.value;
  const dates = [...new Set(etat.courses.map((c) => c.date_course))].sort();
  fd.innerHTML = '<option value="">Toutes</option>' +
    dates.map((d) => `<option value="${d}">${formatDateCourte(d)}</option>`).join('');
  fd.value = gardeD;
}

function viderFormulaire() {
  ['i-prenom', 'i-nom', 'i-tel', 'i-discord', 'i-equipe',
   'i-p2-prenom', 'i-p2-nom', 'i-p2-tel', 'i-p2-discord']
    .forEach((id) => { $(`#${id}`).value = ''; $(`#${id}`).removeAttribute('aria-invalid'); });
  ['i-costume', 'i-reglement', 'i-decharge'].forEach((id) => { $(`#${id}`).checked = false; });
  $('#i-entreprise').value = '';
  $('#i-erreur').hidden = true;
}

/* Validation côté client : elle rend le formulaire agréable.
   Elle ne protège rien — les contraintes de la base et les policies RLS
   s'en chargent, et elles, on ne peut pas les contourner. */
function validerFormulaire() {
  const erreurs = [];
  const requis = (id, libelle) => {
    const el = $(`#${id}`);
    const vide = !el.value.trim();
    el.setAttribute('aria-invalid', String(vide));
    if (vide) erreurs.push(libelle);
    return !vide;
  };

  requis('i-prenom', 'Prénom');
  requis('i-nom', 'Nom');
  requis('i-tel', 'Téléphone');
  requis('i-equipe', "Nom d'équipe");

  if (etat.categorie === 'solo') {
    requis('i-discord', 'Discord');
  } else {
    requis('i-p2-prenom', 'Prénom du second participant');
    requis('i-p2-nom', 'Nom du second participant');
    requis('i-p2-tel', 'Téléphone du second participant');

    // A deux : au moins un Discord. La contrainte discord_requis en base
    // dit exactement la meme chose — ici c'est juste pour le confort.
    const aucun = !$('#i-discord').value.trim() && !$('#i-p2-discord').value.trim();
    $('#i-discord').setAttribute('aria-invalid', String(aucun));
    $('#i-p2-discord').setAttribute('aria-invalid', String(aucun));
    if (aucun) erreurs.push('Discord (au moins un des deux participants)');
  }
  if (etat.categorie === 'entreprise') requis('i-entreprise', 'Entreprise');

  if (!$('#i-reglement').checked) erreurs.push('Acceptation du règlement');
  if (!$('#i-decharge').checked) erreurs.push('Acceptation de la décharge');

  return erreurs;
}

/* Import a la demande, apres un envoi reussi. Si decharge.js manque, on
   n'affiche simplement pas les boutons : l'inscription est enregistree,
   c'est ce qui compte. Le formulaire ne doit pas tomber pour un
   document annexe. */
async function proposerDecharge(inscription, date) {
  const zone = $('#decharge-zone');
  zone.innerHTML = '';

  let D;
  try {
    D = await import('./decharge.js');
  } catch {
    zone.closest('.vide')?.querySelectorAll('p')[1]?.remove();
    return;
  }

  const pilotes = D.pilotesDeLInscription(inscription);

  for (const p of pilotes) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-or';
    btn.textContent = pilotes.length > 1
      ? `Décharge — ${p.prenom} ${p.nom}`
      : 'Télécharger ma décharge';
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await D.telechargerDecharge({ ...p, date });
      } catch (e) {
        notifier(e.message, 'erreur');
      } finally {
        btn.disabled = false;
      }
    };
    zone.appendChild(btn);
  }
}

async function envoyerInscription() {
  if (!etat.inscriptionsOuvertes) {
    majEtatInscriptions();
    return;
  }
  const erreurs = validerFormulaire();
  const zone = $('#i-erreur');

  if (erreurs.length) {
    zone.hidden = false;
    zone.textContent = `À compléter : ${erreurs.join(', ')}.`;
    zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  zone.hidden = true;

  const btn = $('#btn-inscrire');
  btn.disabled = true;
  btn.textContent = 'Envoi…';

  const duo = etat.categorie !== 'solo';

  const { error } = await db.from('inscriptions').insert({
    prenom: $('#i-prenom').value.trim(),
    nom: $('#i-nom').value.trim(),
    telephone: $('#i-tel').value.trim(),
    discord: $('#i-discord').value.trim() || null,
    nom_equipe: $('#i-equipe').value.trim(),
    costume: $('#i-costume').checked,
    categorie: etat.categorie,
    entreprise_id: etat.categorie === 'entreprise' ? $('#i-entreprise').value : null,
    p2_prenom: duo ? $('#i-p2-prenom').value.trim() : null,
    p2_nom: duo ? $('#i-p2-nom').value.trim() : null,
    p2_telephone: duo ? $('#i-p2-tel').value.trim() : null,
    p2_discord: duo ? ($('#i-p2-discord').value.trim() || null) : null,
    reglement_ok: true,
    decharge_ok: true,
    statut: 'en_attente',
    decharge_validee: false,
  });

  btn.disabled = false;
  btn.textContent = "Envoyer l'inscription";

  if (error) {
    zone.hidden = false;
    zone.textContent = messageErreur(error);
    return;
  }

  // RLS interdit au public de relire l'inscription : on ne peut pas
  // récupérer created_at. On prend l'heure locale d'envoi — écart de
  // quelques millisecondes, sans conséquence. Côté panel, c'est bien
  // created_at qui fait foi.
  proposerDecharge({
    prenom: $('#i-prenom').value.trim(),
    nom: $('#i-nom').value.trim(),
    p2_prenom: duo ? $('#i-p2-prenom').value.trim() : null,
    p2_nom: duo ? $('#i-p2-nom').value.trim() : null,
  }, new Date());

  $('#inscription-form').hidden = true;
  $('#inscription-ok').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* =====================================================================
   4. PROGRAMME DES COURSES
   ===================================================================== */

function dessinerCourses() {
  const zone = $('#liste-courses');
  const courses = trierCourses(etat.courses);

  if (!courses.length) {
    zone.innerHTML = `
      <div class="vide">
        <div class="vide-titre">Aucune course au programme</div>
        <p>Le programme sera publié par l'organisation avant l'événement.</p>
      </div>`;
    return;
  }

  const positions = memoriserPositions(zone);
  const parCourse = grouperParCourse(etat.participants);

  zone.innerHTML = courses.map((c) => carteCourse(c, parCourse.get(c.id) ?? [])).join('');
  animerVersNouvellesPositions(zone, positions);

  // Dépliage / repliage
  zone.querySelectorAll('[data-basculer]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.basculer;
      etat.ouvertes.has(id) ? etat.ouvertes.delete(id) : etat.ouvertes.add(id);
      dessinerCourses();
    };
  });
}

function carteCourse(c, lignes) {
  const ouverte = etat.ouvertes.has(c.id);
  const nb = lignes.length;

  return `
  <article class="course ${c.statutAffiche}" data-cle="course-${c.id}">
    <div class="course-tete">
      <div style="flex:1;min-width:0">
        <h3 class="course-nom">${echapper(c.nom)}</h3>
        <div class="course-meta">
          <span>${formatDate(c.date_course)}</span>
          <span class="course-heure">${formatHeure(c.heure_depart)}</span>
          <span class="badge-type ${c.type}">${LIBELLE_TYPE[c.type]}</span>
          <span>${nb} participant${nb > 1 ? 's' : ''}</span>
        </div>
      </div>
      <span class="pastille ${c.statutAffiche}">${LIBELLE_STATUT[c.statutAffiche]}</span>
    </div>

    ${c.description ? `<p class="course-desc">${echapper(c.description)}</p>` : ''}

    ${nb ? `
      <button class="btn btn-mini" data-basculer="${c.id}" style="margin-top:16px"
              aria-expanded="${ouverte}">
        ${ouverte ? 'Masquer' : (c.resultats_publies ? 'Voir le classement' : 'Voir les participants')}
      </button>
      ${ouverte ? blocResultats(c, lignes) : ''}
    ` : ''}
  </article>`;
}

function blocResultats(c, lignes) {
  const triees = trierClassement(lignes);
  const publie = c.resultats_publies;
  const meilleur = triees.find((l) => l.temps_ms != null)?.temps_ms ?? null;

  // Verrou fermé : le public ne voit que la grille de départ.
  // (Les temps ne sont même pas dans la réponse — RLS les a filtrés.)
  if (!publie) {
    return `
      <table class="classement">
        <thead>
          <tr>
            <th style="width:54px">N°</th>
            <th>Participant</th>
            <th class="masque-tel">Entreprise</th>
          </tr>
        </thead>
        <tbody>
          ${triees.map((l) => `
            <tr data-cle="p-${l.participant_id}">
              <td><span class="dossard">${l.dossard ?? '—'}</span></td>
              <td>${celluleEquipe(l)}</td>
              <td class="masque-tel" style="color:var(--texte-2)">${echapper(l.entreprise_nom ?? '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="attente-resultats" style="margin-top:12px">
        ${c.statut === 'terminee'
          ? 'Résultats en cours de validation'
          : 'Résultats publiés à l’issue de la course'}
      </div>`;
  }

  return `
    <table class="classement">
      <thead>
        <tr>
          <th style="width:54px">Pos.</th>
          <th style="width:54px">N°</th>
          <th>Participant</th>
          <th class="masque-tel">Entreprise</th>
          <th style="text-align:right">Temps</th>
        </tr>
      </thead>
      <tbody>
        ${triees.map((l) => ligneClassement(l, meilleur)).join('')}
      </tbody>
    </table>`;
}

function ligneClassement(l, meilleur) {
  const ecart = l.abandon ? '' : formatEcart(l.temps_ms, meilleur);

  return `
  <tr class="${l.abandon ? 'est-abandon' : ''} ${l.position ? `rang-${l.position}` : ''}"
      data-cle="p-${l.participant_id}">
    <td class="pos">${l.abandon ? '—' : (l.position ?? '—')}</td>
    <td><span class="dossard">${l.dossard ?? '—'}</span></td>
    <td>${celluleEquipe(l)}</td>
    <td class="masque-tel" style="color:var(--texte-2)">${echapper(l.entreprise_nom ?? '—')}</td>
    <td style="text-align:right">
      ${l.abandon
        ? '<span class="abandon-tag">Abandon</span>'
        : `<span class="temps">${formatTemps(l.temps_ms)}</span>
           ${ecart ? `<div style="font-size:11px;color:var(--texte-3);font-family:var(--f-chrono)">${ecart}</div>` : ''}`}
    </td>
  </tr>`;
}


/* =====================================================================
   5. CLASSEMENT GÉNÉRAL
   ===================================================================== */

function brancherFiltres() {
  ['#f-type', '#f-course', '#f-entreprise', '#f-date'].forEach((sel) => {
    $(sel).onchange = dessinerGeneral;
  });
}

function dessinerGeneral() {
  const zone = $('#tableau-general');

  const fType = $('#f-type').value;
  const fCourse = $('#f-course').value;
  const fEnt = $('#f-entreprise').value;
  const fDate = $('#f-date').value;

  let lignes = etat.general.filter((l) => l.temps_ms != null || l.abandon);
  if (fType) lignes = lignes.filter((l) => l.course_type === fType);
  if (fCourse) lignes = lignes.filter((l) => l.course_id === fCourse);
  if (fEnt) lignes = lignes.filter((l) => l.entreprise_id === fEnt);
  if (fDate) lignes = lignes.filter((l) => l.date_course === fDate);

  if (!lignes.length) {
    zone.innerHTML = `
      <div class="vide">
        <div class="vide-titre">Aucun résultat</div>
        <p>${etat.general.some((l) => l.temps_ms != null)
          ? 'Aucun temps ne correspond à ces filtres. Élargis la sélection.'
          : 'Les temps apparaîtront ici dès la publication des premiers résultats.'}</p>
      </div>`;
    return;
  }

  // Les positions du classement général sont recalculées après filtrage :
  // filtrer sur les entreprises et garder « 7e » n'aurait aucun sens.
  const triees = trierClassement(lignes);
  const meilleur = triees.find((l) => l.temps_ms != null)?.temps_ms ?? null;
  let rang = 0;
  let dernierTemps = null;
  let dernierRang = 0;

  const positions = memoriserPositions(zone);

  zone.innerHTML = `
    <table class="classement">
      <thead>
        <tr>
          <th style="width:54px">Pos.</th>
          <th>Participant</th>
          <th class="masque-tel">Entreprise</th>
          <th class="masque-tel">Course</th>
          <th style="text-align:right">Temps</th>
        </tr>
      </thead>
      <tbody>
        ${triees.map((l) => {
          let pos = null;
          if (!l.abandon && l.temps_ms != null) {
            rang++;
            // Ex aequo : même temps, même place.
            pos = l.temps_ms === dernierTemps ? dernierRang : rang;
            dernierTemps = l.temps_ms;
            dernierRang = pos;
          }
          const ecart = l.abandon ? '' : formatEcart(l.temps_ms, meilleur);
          return `
          <tr class="${l.abandon ? 'est-abandon' : ''} ${pos ? `rang-${pos}` : ''}"
              data-cle="g-${l.participant_id}">
            <td class="pos">${pos ?? '—'}</td>
            <td>${celluleEquipe(l)}</td>
            <td class="masque-tel" style="color:var(--texte-2)">${echapper(l.entreprise_nom ?? '—')}</td>
            <td class="masque-tel" style="color:var(--texte-2);font-size:13px">${echapper(l.course_nom)}</td>
            <td style="text-align:right">
              ${l.abandon
                ? '<span class="abandon-tag">Abandon</span>'
                : `<span class="temps">${formatTemps(l.temps_ms)}</span>
                   ${ecart ? `<div style="font-size:11px;color:var(--texte-3);font-family:var(--f-chrono)">${ecart}</div>` : ''}`}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <p class="aide" style="margin-top:16px">
      ${triees.filter((l) => !l.abandon).length} temps classé(s)${
        triees.some((l) => l.abandon) ? ` · ${triees.filter((l) => l.abandon).length} abandon(s)` : ''}
    </p>`;

  animerVersNouvellesPositions(zone, positions);
}


demarrer();
