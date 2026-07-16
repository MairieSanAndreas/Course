/* =====================================================================
   NOYAU PARTAGÉ — client Supabase, chronos, tri, temps réel, UI
   Importé par public.js, admin.js et live.js.
   ===================================================================== */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AFFICHAGE } from './config.js';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } },
});


/* =====================================================================
   1. CHRONOS
   Les temps vivent en millisecondes (entier) du début à la fin.
   Ces deux fonctions sont la seule frontière avec le texte lisible.
   ===================================================================== */

/* Accepte : 2:47 · 2:47.3 · 2:47.320 · 1:02:47.320 · 47 · 47.5 · 2:47,320
   Renvoie un entier en millisecondes, ou null si la saisie est invalide. */
export function parseTemps(saisie) {
  const s = String(saisie ?? '').trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,3})(?::([0-5]?\d))?(?::([0-5]?\d))?(?:[.,](\d{1,3}))?$/);
  if (!m) return null;

  const parts = [m[1], m[2], m[3]].filter((v) => v !== undefined).map(Number);
  let h = 0, min = 0, sec = 0;
  if (parts.length === 3) [h, min, sec] = parts;
  else if (parts.length === 2) [min, sec] = parts;
  else [sec] = parts;

  const ms = m[4] ? Number(m[4].padEnd(3, '0')) : 0;
  const total = (h * 3600 + min * 60 + sec) * 1000 + ms;
  return total > 0 ? total : null;
}

/* Millisecondes → texte. Omet les heures tant qu'on est sous 1 h. */
export function formatTemps(ms) {
  if (ms === null || ms === undefined) return '—';

  const h = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const mil = ms % 1000;

  const p = (n, l = 2) => String(n).padStart(l, '0');
  let out = h > 0 ? `${h}:${p(min)}:${p(sec)}` : `${min}:${p(sec)}`;
  if (AFFICHAGE.afficherMs) out += `.${p(mil, 3)}`;
  return out;
}

/* Écart avec le meilleur temps : « +2.560 ». Sert au classement. */
export function formatEcart(ms, reference) {
  if (ms == null || reference == null || ms === reference) return '';
  const d = ms - reference;
  const sec = Math.floor(d / 1000);
  const mil = d % 1000;
  return AFFICHAGE.afficherMs
    ? `+${sec}.${String(mil).padStart(3, '0')}`
    : `+${sec}`;
}


/* =====================================================================
   2. STATUTS DE COURSE
   « prochaine » n'existe pas en base : il se calcule ici, à chaque
   rendu. Une course terminée bascule donc la suivante toute seule.
   ===================================================================== */

export const ORDRE_STATUT = {
  en_cours: 0,
  prochaine: 1,
  a_venir: 2,
  terminee: 3,
  annulee: 4,
};

export const LIBELLE_STATUT = {
  en_cours: 'En cours',
  prochaine: 'Prochaine course',
  a_venir: 'À venir',
  terminee: 'Terminée',
  annulee: 'Annulée',
};

/* Type de COURSE (publique / entreprise) — à ne pas confondre avec la
   catégorie d'INSCRIPTION ci-dessous, qui a trois valeurs. */
export const LIBELLE_TYPE = { publique: 'Public', entreprise: 'Entreprise' };

/* Catégorie d'inscription (solo / duo / entreprise) */
export const LIBELLE_CATEGORIE = { solo: 'Solo', duo: 'Duo', entreprise: 'Entreprise' };

/* Horodatage d'une course, pour comparer et trier. */
export function horodatage(course) {
  return new Date(`${course.date_course}T${course.heure_depart}`).getTime();
}

/* Ajoute statutAffiche : identique au statut stocké, sauf pour la
   première course « à venir » dans l'ordre chronologique, qui devient
   « prochaine ». Une seule course peut porter ce statut. */
export function decorerStatuts(courses) {
  const prochaine = courses
    .filter((c) => c.statut === 'a_venir')
    .sort((a, b) => horodatage(a) - horodatage(b))[0];

  return courses.map((c) => ({
    ...c,
    statutAffiche: c.id === prochaine?.id ? 'prochaine' : c.statut,
  }));
}

/* Tri d'affichage imposé par le cahier des charges §4 :
   en cours → prochaine → à venir → terminées → annulées.
   Les terminées sont en ordre inverse : la dernière descente en tête
   du groupe, c'est celle que les gens cherchent. */
export function trierCourses(courses) {
  return decorerStatuts(courses).sort((a, b) => {
    const d = ORDRE_STATUT[a.statutAffiche] - ORDRE_STATUT[b.statutAffiche];
    if (d !== 0) return d;
    return a.statutAffiche === 'terminee'
      ? horodatage(b) - horodatage(a)
      : horodatage(a) - horodatage(b);
  });
}

/* Tri des lignes d'un classement : positions, puis non chronométrés,
   puis abandons — toujours en bas. */
export function trierClassement(lignes) {
  return [...lignes].sort((a, b) => {
    if (a.abandon !== b.abandon) return a.abandon ? 1 : -1;
    if (a.temps_ms == null && b.temps_ms == null) {
      return (a.ordre_depart ?? a.dossard ?? 0) - (b.ordre_depart ?? b.dossard ?? 0);
    }
    if (a.temps_ms == null) return 1;
    if (b.temps_ms == null) return -1;
    return a.temps_ms - b.temps_ms;
  });
}


/* =====================================================================
   3. TEMPS RÉEL
   Toute écriture en base déclenche un rechargement complet, débouncé.
   Les volumes sont minuscules (quelques dizaines de lignes) : recharger
   est plus fiable que réconcilier un état local, et invisible à l'usage.
   ===================================================================== */

export function debounce(fn, delai = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delai);
  };
}

/* Écoute une ou plusieurs tables. Renvoie le canal, à désabonner au
   besoin. onEtat reçoit true/false selon l'état de la connexion. */
export function ecouter(tables, onChangement, onEtat) {
  const canal = db.channel(`maj-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`);

  tables.forEach((table) => {
    canal.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      onChangement(payload);
    });
  });

  canal.subscribe((statut) => {
    onEtat?.(statut === 'SUBSCRIBED');
  });

  return canal;
}

/* Reconnexion après une mise en veille : le WebSocket meurt en silence
   quand l'onglet dort. Sans ça, un écran géant laissé la nuit se fige. */
export function surReveil(rafraichir) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rafraichir();
  });
  window.addEventListener('online', rafraichir);
}


/* =====================================================================
   4. REQUÊTES
   ===================================================================== */

export async function chargerCourses() {
  const { data, error } = await db.from('courses').select('*');
  if (error) throw error;
  return data;
}

export async function chargerParticipants() {
  const { data, error } = await db
    .from('v_classement_course')
    .select('*');
  if (error) throw error;
  return data;
}

export async function chargerEntreprises() {
  const { data, error } = await db.from('entreprises').select('*').order('nom');
  if (error) throw error;
  return data;
}

export async function chargerClassementGeneral() {
  const { data, error } = await db.from('v_classement_general').select('*');
  if (error) throw error;
  return data;
}

/* Regroupe les lignes de v_classement_course par course. */
export function grouperParCourse(lignes) {
  const map = new Map();
  for (const l of lignes) {
    if (!map.has(l.course_id)) map.set(l.course_id, []);
    map.get(l.course_id).push(l);
  }
  return map;
}


/* =====================================================================
   5. UI — notifications, modales, échappement
   ===================================================================== */

/* Nom d'équipe + pilotes en dessous. Partagé par le site public et le
   panel, pour que les deux affichent exactement la même chose. */
export function celluleEquipe(ligne) {
  return `<div style="font-weight:600">${echapper(ligne.participant_nom)}</div>`
    + (ligne.pilotes ? `<div class="pilotes">${echapper(ligne.pilotes)}</div>` : '');
}

export function echapper(txt) {
  const d = document.createElement('div');
  d.textContent = txt ?? '';
  return d.innerHTML;
}

let zoneNotifs;

export function notifier(message, type = 'info', duree = 3800) {
  if (!zoneNotifs) {
    zoneNotifs = document.createElement('div');
    zoneNotifs.className = 'notifs';
    zoneNotifs.setAttribute('role', 'status');
    zoneNotifs.setAttribute('aria-live', 'polite');
    document.body.appendChild(zoneNotifs);
  }

  const n = document.createElement('div');
  n.className = `notif ${type}`;
  n.textContent = message;
  zoneNotifs.appendChild(n);

  setTimeout(() => {
    n.classList.add('sort');
    setTimeout(() => n.remove(), 260);
  }, duree);
}

/* Confirmation avant suppression — imposée par le cahier des charges §8.
   Renvoie une promesse booléenne. */
export function confirmer({ titre, message, bouton = 'Supprimer', danger = true }) {
  return new Promise((resoudre) => {
    const voile = document.createElement('div');
    voile.className = 'voile';
    voile.innerHTML = `
      <div class="modale ${danger ? 'modale-danger' : ''}" role="dialog" aria-modal="true">
        <div class="modale-tete"><span class="modale-titre">${echapper(titre)}</span></div>
        <div class="modale-corps"><p style="color:var(--texte-2);font-size:15px">${message}</p></div>
        <div class="modale-pied">
          <button class="btn" data-non>Annuler</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-or'}" data-oui>${echapper(bouton)}</button>
        </div>
      </div>`;

    const fermer = (reponse) => {
      voile.remove();
      document.removeEventListener('keydown', surTouche);
      resoudre(reponse);
    };
    const surTouche = (e) => { if (e.key === 'Escape') fermer(false); };

    voile.querySelector('[data-non]').onclick = () => fermer(false);
    voile.querySelector('[data-oui]').onclick = () => fermer(true);
    voile.onclick = (e) => { if (e.target === voile) fermer(false); };
    document.addEventListener('keydown', surTouche);

    document.body.appendChild(voile);
    voile.querySelector('[data-non]').focus();
  });
}

/* Modale générique. contenu = HTML, onValider = async () => bool.
   Renvoyer false depuis onValider laisse la modale ouverte (erreur de
   validation) ; renvoyer true la ferme. */
export function ouvrirModale({ titre, contenu, bouton = 'Enregistrer', onValider, large = false }) {
  const voile = document.createElement('div');
  voile.className = 'voile';
  voile.innerHTML = `
    <div class="modale" role="dialog" aria-modal="true" ${large ? 'style="max-width:760px"' : ''}>
      <div class="modale-tete">
        <span class="modale-titre">${echapper(titre)}</span>
        <button class="btn-icone pousse" data-fermer aria-label="Fermer">✕</button>
      </div>
      <div class="modale-corps" data-corps>${contenu}</div>
      <div class="modale-pied">
        <button class="btn" data-annuler>Annuler</button>
        <button class="btn btn-or" data-ok>${echapper(bouton)}</button>
      </div>
    </div>`;

  const fermer = () => {
    voile.remove();
    document.removeEventListener('keydown', surTouche);
  };
  const surTouche = (e) => { if (e.key === 'Escape') fermer(); };

  voile.querySelector('[data-fermer]').onclick = fermer;
  voile.querySelector('[data-annuler]').onclick = fermer;
  voile.onclick = (e) => { if (e.target === voile) fermer(); };
  document.addEventListener('keydown', surTouche);

  const ok = voile.querySelector('[data-ok]');
  ok.onclick = async () => {
    ok.disabled = true;
    try {
      const fini = await onValider(voile.querySelector('[data-corps]'));
      if (fini !== false) fermer();
    } finally {
      ok.disabled = false;
    }
  };

  document.body.appendChild(voile);
  voile.querySelector('input, select, textarea')?.focus();
  return { voile, fermer };
}


/* =====================================================================
   6. RECLASSEMENT ANIMÉ (technique FLIP)
   Quand un résultat est publié, les lignes glissent jusqu'à leur
   nouvelle place au lieu de sauter. Sur l'écran géant, c'est ce qui
   fait qu'on voit la course se jouer.
   ===================================================================== */

export function memoriserPositions(conteneur) {
  const positions = new Map();
  for (const el of conteneur.querySelectorAll('[data-cle]')) {
    positions.set(el.dataset.cle, el.getBoundingClientRect().top);
  }
  return positions;
}

export function animerVersNouvellesPositions(conteneur, positions) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const el of conteneur.querySelectorAll('[data-cle]')) {
    const avant = positions.get(el.dataset.cle);
    if (avant === undefined) continue;

    const delta = avant - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 2) continue;

    el.style.transform = `translateY(${delta}px)`;
    el.classList.remove('glisse');
    requestAnimationFrame(() => {
      el.classList.add('glisse');
      el.style.transform = '';
    });
  }
}


/* =====================================================================
   7. DIVERS
   ===================================================================== */

export function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatDateCourte(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function formatHeure(heure) {
  return String(heure).slice(0, 5).replace(':', 'h');
}

export function formatDateHeure(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/* Message d'erreur exploitable, en français.
   Les erreurs ne s'excusent pas et ne sont jamais vagues. */
export function messageErreur(e) {
  const code = e?.code;
  const brut = e?.message ?? String(e);

  if (code === '23505') return 'Cette valeur existe déjà. Vérifie les dossards et les doublons.';
  if (code === '23514') return 'Les données ne respectent pas une règle de la base. Vérifie la saisie.';
  if (code === '42501' || brut.includes('row-level security')) {
    return "Ton compte n'a pas le droit d'effectuer cette action.";
  }
  if (brut.includes('Failed to fetch')) return 'Connexion perdue. Vérifie le réseau.';
  if (brut.includes('Invalid login')) return 'Identifiant ou mot de passe incorrect.';
  return brut;
}
