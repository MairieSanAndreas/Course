/* =====================================================================
   DÉCHARGE DE RESPONSABILITÉ
   Génère un PNG dans le navigateur : le fond exporté depuis Slides,
   sur lequel on dessine le nom, l'horodatage et la signature.

   Pas de serveur, pas de bibliothèque : <canvas> suffit, et ça marche
   tel quel sur GitHub Pages.

   ⚠️ Un nom tapé au clavier n'est pas une signature. Ce document est
   une pièce RP, pas un acte. Il n'a aucune valeur juridique réelle.
   ===================================================================== */

import { DECHARGE } from './config.js';

/* Le fond est chargé une fois, puis réutilisé : générer huit décharges
   d'affilée ne doit pas retélécharger huit fois la même image. */
let fondCache = null;
let fondErreur = null;

async function chargerFond() {
  if (fondCache) return fondCache;
  if (fondErreur) throw fondErreur;

  const img = new Image();
  img.src = DECHARGE.fond;
  try {
    await img.decode();
  } catch {
    fondErreur = new Error(
      `Fond introuvable : ${DECHARGE.fond}. Exporte la décharge en PNG depuis ` +
      `Google Slides et dépose-la à cet emplacement.`,
    );
    throw fondErreur;
  }
  fondCache = img;
  return img;
}

/* Les polices doivent être réellement chargées avant le premier
   fillText, sinon le navigateur dessine avec une police de repli et le
   rendu est faux — silencieusement. */
async function chargerPolices(h) {
  const essais = [
    `${Math.round(h * DECHARGE.participant.taille / 100)}px "${DECHARGE.policeTexte}"`,
    `bold ${Math.round(h * DECHARGE.participant.taille / 100)}px "${DECHARGE.policeTexte}"`,
    `${Math.round(h * DECHARGE.date.taille / 100)}px "${DECHARGE.policeTexte}"`,
    `${Math.round(h * DECHARGE.signature.taille / 100)}px "${DECHARGE.policeSignature}"`,
  ];
  await Promise.all(essais.map((f) => document.fonts.load(f).catch(() => {})));
  await document.fonts.ready;
}

/* Dessine plusieurs fragments de polices différentes comme une seule
   ligne centrée. Indispensable ici : « Le Participant, Monsieur/Madame »
   est en normal et le nom en gras, mais les deux doivent se centrer
   ensemble — sinon la ligne se décale dès que le nom est long. */
function ligneCentree(ctx, fragments, cx, y) {
  const largeurs = fragments.map((f) => {
    ctx.font = f.police;
    return ctx.measureText(f.texte).width;
  });
  let x = cx - largeurs.reduce((a, b) => a + b, 0) / 2;

  fragments.forEach((f, i) => {
    ctx.font = f.police;
    ctx.fillStyle = f.couleur;
    ctx.fillText(f.texte, x, y);
    x += largeurs[i];
  });
}

/* « Le 16/07/2026 à 21h04 à Los Santos » */
export function formatHorodatage(date) {
  const j = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const h = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return `Le ${j} à ${h} à ${DECHARGE.ville}`;
}

/* Rétrécit le texte jusqu'à ce qu'il tienne. Un nom à rallonge ne doit
   pas déborder du cadre de signature. */
function taillePourTenir(ctx, texte, police, taille, largeurMax) {
  let t = taille;
  for (let i = 0; i < 24; i++) {
    ctx.font = police.replace('__T__', t);
    if (ctx.measureText(texte).width <= largeurMax) break;
    t -= Math.max(1, Math.round(taille * 0.04));
  }
  return t;
}

/* Génère la décharge d'UNE personne. Un duo = deux appels. */
export async function genererDecharge({ prenom, nom, date }) {
  const fond = await chargerFond();
  const L = fond.naturalWidth;
  const H = fond.naturalHeight;

  await chargerPolices(H);

  const c = document.createElement('canvas');
  c.width = L;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(fond, 0, 0);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const pc = (v, total) => (v / 100) * total;
  const complet = `${prenom} ${nom}`.trim();

  // --- Ligne « Le Participant, Monsieur/Madame Nom Prénom » ---
  const p = DECHARGE.participant;
  const tp = Math.round(pc(p.taille, H));
  ligneCentree(ctx, [
    { texte: DECHARGE.libelleParticipant, police: `${tp}px "${DECHARGE.policeTexte}"`, couleur: p.couleur },
    { texte: complet, police: `bold ${tp}px "${DECHARGE.policeTexte}"`, couleur: p.couleur },
  ], pc(p.x, L), pc(p.y, H));

  // --- Ligne d'horodatage ---
  const d = DECHARGE.date;
  const td = Math.round(pc(d.taille, H));
  ligneCentree(ctx, [
    { texte: formatHorodatage(date), police: `${td}px "${DECHARGE.policeTexte}"`, couleur: d.couleur },
  ], pc(d.x, L), pc(d.y, H));

  // --- Signature manuscrite ---
  const s = DECHARGE.signature;
  const ts = taillePourTenir(
    ctx, complet,
    `__T__px "${DECHARGE.policeSignature}"`,
    Math.round(pc(s.taille, H)),
    pc(s.largeurMax, L),
  );
  ctx.font = `${ts}px "${DECHARGE.policeSignature}"`;
  ctx.fillStyle = s.couleur;
  ctx.textAlign = 'center';
  ctx.fillText(complet, pc(s.x, L), pc(s.y, H));

  return c;
}

function slug(t) {
  return String(t ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export async function telechargerDecharge({ prenom, nom, date }) {
  const c = await genererDecharge({ prenom, nom, date });
  const a = document.createElement('a');
  a.download = `decharge-${slug(prenom)}-${slug(nom)}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

/* Un duo signe deux décharges, une par pilote — le document parle du
   « Participant » au singulier. */
export function pilotesDeLInscription(i) {
  const liste = [{ prenom: i.prenom, nom: i.nom }];
  if (i.p2_prenom && i.p2_nom) liste.push({ prenom: i.p2_prenom, nom: i.p2_nom });
  return liste;
}
