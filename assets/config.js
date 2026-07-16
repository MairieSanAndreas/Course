/* =====================================================================
   CONFIGURATION
   Seul fichier à modifier après un clonage du dépôt.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Supabase — Project Settings → API
   ⚠️  Remplacer les deux valeurs ci-dessous avant la mise en ligne.
   --------------------------------------------------------------------- */

export const SUPABASE_URL = 'https://ojrvdpamvrpyscugdtlw.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_hcnPKmjUr9AhK2MU6k0BPA_EBzqKwZ-';

/* La clé « anon » est publique par conception : elle ne donne aucun
   droit. Ce sont les policies RLS (sql/02_rls.sql) qui décident de tout.
   Ne JAMAIS mettre la clé « service_role » ici : elle contourne RLS. */


/* ---------------------------------------------------------------------
   Événement
   --------------------------------------------------------------------- */

export const EVENEMENT = {
  organisation: 'Mairie de San Andréas',
  nom: 'Course de Caisses à Savon',
  lieu: 'Mont Chiliad',
  date: '1ᵉʳ août 2026 — 21h00',

  // Liens des documents légaux du formulaire d'inscription
  lienReglement: '#',
  lienDecharge: '#',
};


/* ---------------------------------------------------------------------
   Affichage
   --------------------------------------------------------------------- */

export const AFFICHAGE = {
  /* Millisecondes dans les chronos.
     true  → 2:47.320   (chronométrage au millième)
     false → 2:47        (chronométrage à la seconde)
     À caler sur la précision réelle de ton système de chrono : afficher
     « .000 » partout quand on chronomètre à la seconde fait faux. */
  afficherMs: true,

  /* Rotation automatique des courses sur l'écran géant, en secondes.
     0 = pas de rotation, la course en cours reste seule à l'écran. */
  rotationLive: 0,
};
