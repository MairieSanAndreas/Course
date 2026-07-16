/* =====================================================================
   CONFIGURATION
   Seul fichier à modifier après un clonage du dépôt.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Supabase — Project Settings → API
   --------------------------------------------------------------------- */

export const SUPABASE_URL = 'https://ojrvdpamvrpyscugdtlw.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_hcnPKmjUr9AhK2MU6k0BPA_EBzqKwZ-';

/* Cette cle est publique par conception — c'est son role. Elle ne donne
   aucun droit : les policies RLS (sql/02_rls.sql) decident de tout.
   La cle a ne JAMAIS mettre ici commence par « sb_secret_ » : elle
   contourne RLS et donne un acces total a la base. */


/* ---------------------------------------------------------------------
   Evenement
   --------------------------------------------------------------------- */

export const EVENEMENT = {
  organisation: 'Mairie de San Andréas',
  nom: 'Course de Caisses à Savon',
  lieu: 'Mont Chiliad',
  date: '1ᵉʳ août 2026 — 21h00',

  // Liens des documents legaux du formulaire d'inscription.
  // ⚠️ Google Slides : utiliser /preview et NON /edit. /edit demande une
  // autorisation aux joueurs, et si le partage est ouvert en ecriture,
  // ils peuvent modifier le document.
  lienReglement: '#',
  lienDecharge: 'https://docs.google.com/presentation/d/1JeFwdCrhcxxrKLsPluhkWY9hKdkmaFDkik8Gy9raIfI/preview',
};


/* ---------------------------------------------------------------------
   Affichage
   --------------------------------------------------------------------- */

export const AFFICHAGE = {
  /* Millisecondes dans les chronos.
     true  → 2:47.320   (chronometrage au millieme)
     false → 2:47        (chronometrage a la seconde)
     A caler sur la precision reelle de ton systeme de chrono : afficher
     « .000 » partout quand on chronometre a la seconde fait faux. */
  afficherMs: true,

  /* Rotation automatique des courses sur l'ecran geant, en secondes.
     0 = pas de rotation, la course en cours reste seule a l'ecran. */
  rotationLive: 0,
};


/* ---------------------------------------------------------------------
   Decharge de responsabilite generee en PNG

   Le fond est la decharge Bullhead exportee depuis Google Slides, SANS
   les trois valeurs a remplir. Le site dessine par-dessus.

   VALEURS CALIBREES sur assets/decharge.png (1054 × 1492).
   Elles ont ete mesurees sur l'image, pas estimees :
     · les lignes du preambule sont espacees de 69 px tres regulierement
       (ENTRE 411 → Maire 480 → et 549), la ligne participant tombe donc
       a 618, soit 41.42 %
     · « Validation du contrat : » est a 1170 ; la date se place 44 px
       dessous, a 1214, soit 81.37 %
     · le cadre de signature gauche va de (125, 1320) a (506, 1441),
       centre exact (316, 1380) → 29.93 % / 92.53 %

   Tout est en POURCENTAGE de l'image, jamais en pixels : tu peux
   reexporter le fond dans une autre resolution sans rien recalibrer.
     x → % de la largeur    y → % de la hauteur
     taille → % de la hauteur (1.9 % sur 1492 px = 28 px)

   Pour reajuster : panel → Inscriptions → bouton 📄 → l'apercu s'affiche.
   Modifie, recharge (Ctrl+Shift+R), recommence.
   --------------------------------------------------------------------- */

export const DECHARGE = {
  fond: 'assets/decharge.png',
  ville: 'Los Santos',

  // Texte precedant le nom. Le nom est ajoute en gras juste apres, et
  // l'ensemble se centre comme une seule ligne — c'est pour ca que la
  // ligne entiere a ete retiree du fond plutot que le seul « xxx ».
  libelleParticipant: 'Le Participant, Monsieur/Madame ',

  participant: { x: 50,    y: 41.42, taille: 1.9, couleur: '#1F3864' },
  date:        { x: 50,    y: 81.37, taille: 1.5, couleur: '#1F1F1F' },
  signature:   { x: 29.93, y: 92.53, taille: 3.2, couleur: '#111111',
                 largeurMax: 30 },   // % de la largeur — le cadre de gauche

  policeTexte: 'Georgia, serif',
  policeSignature: 'Dancing Script',
};
