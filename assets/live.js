/* =====================================================================
   ÉCRAN GÉANT
   Aucune interaction : la page se lance et vit seule toute la soirée.
   Elle affiche la course en cours ; s'il n'y en a pas, la prochaine ;
   sinon la dernière terminée.
   ===================================================================== */

import {
  chargerCourses, chargerParticipants, grouperParCourse, trierCourses,
  trierClassement, ecouter, surReveil, debounce,
  formatTemps, formatEcart, formatDateCourte, formatHeure,
  LIBELLE_STATUT, LIBELLE_TYPE, echapper,
  memoriserPositions, animerVersNouvellesPositions,
} from './api.js';
import { EVENEMENT, AFFICHAGE } from './config.js';

const $ = (s) => document.querySelector(s);
const etat = { courses: [], participants: [], indexRotation: 0 };


/* =====================================================================
   1. DÉMARRAGE
   ===================================================================== */

async function demarrer() {
  $('#live-marque').textContent = EVENEMENT.organisation;
  $('#live-event').textContent = `${EVENEMENT.nom} — ${EVENEMENT.lieu}`;

  horloge();
  setInterval(horloge, 1000);

  await rafraichir();

  const redessiner = debounce(rafraichir, 150);
  ecouter(['courses', 'participants', 'resultats'], redessiner);

  // Un écran laissé allumé perd son WebSocket au bout de quelques heures
  // sans rien signaler. Ce filet de sécurité évite un tableau figé
  // pendant la course.
  surReveil(rafraichir);
  setInterval(rafraichir, 60000);

  if (AFFICHAGE.rotationLive > 0) {
    setInterval(() => { etat.indexRotation++; dessiner(); }, AFFICHAGE.rotationLive * 1000);
  }
}

function horloge() {
  $('#live-horloge').textContent = new Date().toLocaleTimeString('fr-FR');
}

async function rafraichir() {
  try {
    const [courses, participants] = await Promise.all([chargerCourses(), chargerParticipants()]);
    etat.courses = courses;
    etat.participants = participants;
    dessiner();
  } catch (e) {
    console.error(e);
  }
}


/* =====================================================================
   2. RENDU
   ===================================================================== */

function dessiner() {
  const courses = trierCourses(etat.courses);
  const parCourse = grouperParCourse(etat.participants);

  if (!courses.length) {
    $('#live-scene').innerHTML = `
      <div class="live-verrou">Programme en préparation</div>`;
    $('#live-cote').innerHTML = '';
    return;
  }

  // Priorité : en cours → prochaine → dernière terminée → première.
  const candidates = courses.filter((c) => c.statutAffiche === 'en_cours');
  let vedette;

  if (candidates.length) {
    vedette = candidates[etat.indexRotation % candidates.length];
  } else {
    vedette = courses.find((c) => c.statutAffiche === 'prochaine')
      ?? courses.find((c) => c.statutAffiche === 'terminee')
      ?? courses[0];
  }

  dessinerScene(vedette, trierClassement(parCourse.get(vedette.id) ?? []));
  dessinerCote(courses, vedette, parCourse);
}

function dessinerScene(c, lignes) {
  const zone = $('#live-scene');
  const positions = memoriserPositions(zone);
  const meilleur = lignes.find((l) => l.temps_ms != null)?.temps_ms ?? null;

  const entete = `
    <div class="live-titre-course">
      <span class="live-pastille ${c.statutAffiche}">${LIBELLE_STATUT[c.statutAffiche]}</span>
      <span class="live-nom">${echapper(c.nom)}</span>
      <span class="live-heure">${formatHeure(c.heure_depart)}</span>
    </div>`;

  if (!lignes.length) {
    zone.innerHTML = entete + '<div class="live-verrou">Grille de départ à venir</div>';
    return;
  }

  // Verrou fermé : la grille de départ, sans les temps.
  // (RLS ne les envoie même pas — cette page utilise la clé anonyme.)
  if (!c.resultats_publies) {
    zone.innerHTML = entete + `
      <div class="live-liste">
        ${lignes.slice(0, 12).map((l) => `
          <div class="live-ligne" data-cle="${l.participant_id}">
            <div class="live-pos">${l.ordre_depart ?? '—'}</div>
            <div class="live-dossard">${l.dossard ?? '—'}</div>
            <div style="min-width:0">
              <div class="live-nom-p">${echapper(l.participant_nom)}</div>
              ${l.entreprise_nom ? `<div class="live-ent">${echapper(l.entreprise_nom)}</div>` : ''}
            </div>
            <div></div>
          </div>`).join('')}
      </div>
      <div class="live-verrou" style="flex:0;padding:1.4vh;margin-top:1.4vh">
        ${c.statut === 'terminee' ? 'Résultats en cours de validation' : 'Grille de départ'}
      </div>`;
    return;
  }

  zone.innerHTML = entete + `
    <div class="live-liste">
      ${lignes.slice(0, 12).map((l) => {
        const ecart = l.abandon ? '' : formatEcart(l.temps_ms, meilleur);
        return `
        <div class="live-ligne ${l.abandon ? 'est-abandon' : ''} ${l.position ? `rang-${l.position}` : ''}"
             data-cle="${l.participant_id}">
          <div class="live-pos">${l.abandon ? '—' : (l.position ?? '—')}</div>
          <div class="live-dossard">${l.dossard ?? '—'}</div>
          <div style="min-width:0">
            <div class="live-nom-p">${echapper(l.participant_nom)}</div>
            ${l.entreprise_nom ? `<div class="live-ent">${echapper(l.entreprise_nom)}</div>` : ''}
          </div>
          <div>
            ${l.abandon
              ? '<div class="live-abandon">Abandon</div>'
              : `<div class="live-temps">${formatTemps(l.temps_ms)}</div>
                 ${ecart ? `<div class="live-ecart">${ecart}</div>` : ''}`}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // Le classement se réordonne à l'écran quand un temps tombe.
  animerVersNouvellesPositions(zone, positions);
}

function dessinerCote(courses, vedette, parCourse) {
  const prochaine = courses.find((c) => c.statutAffiche === 'prochaine' && c.id !== vedette.id);
  const suite = courses
    .filter((c) => ['prochaine', 'a_venir'].includes(c.statutAffiche)
      && c.id !== vedette.id && c.id !== prochaine?.id)
    .slice(0, 6);

  const publiees = courses.filter((c) => c.resultats_publies && c.id !== vedette.id).slice(0, 3);

  $('#live-cote').innerHTML = `
    ${prochaine ? `
      <div class="live-bloc prochaine">
        <div class="live-bloc-titre">Prochaine course</div>
        <div class="live-bloc-nom">${echapper(prochaine.nom)}</div>
        <div class="live-bloc-meta">
          <span class="h">${formatHeure(prochaine.heure_depart)}</span>
          <span>${LIBELLE_TYPE[prochaine.type]}</span>
          <span>${(parCourse.get(prochaine.id) ?? []).length} engagés</span>
        </div>
      </div>` : ''}

    ${suite.length ? `
      <div class="live-bloc live-suite">
        <div class="live-bloc-titre">Suite du programme</div>
        ${suite.map((c) => `
          <div class="live-suite-item">
            <span class="h">${formatHeure(c.heure_depart)}</span>
            <span class="n">${echapper(c.nom)}</span>
          </div>`).join('')}
      </div>` : ''}

    ${publiees.length ? `
      <div class="live-bloc">
        <div class="live-bloc-titre">Meilleurs temps</div>
        ${publiees.map((c) => {
          const premier = trierClassement(parCourse.get(c.id) ?? []).find((l) => l.temps_ms != null);
          if (!premier) return '';
          return `
          <div class="live-suite-item">
            <span class="n" style="font-size:1.5vh">${echapper(premier.participant_nom)}</span>
            <span class="h">${formatTemps(premier.temps_ms)}</span>
          </div>`;
        }).join('')}
      </div>` : ''}

    <div class="live-pied">
      <span class="direct actif">En direct</span>
      <span style="margin-left:auto">${formatDateCourte(vedette.date_course)}</span>
    </div>`;
}


demarrer();
