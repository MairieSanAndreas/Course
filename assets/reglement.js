/* =====================================================================
   RÈGLEMENT DE LA COURSE
   Le texte vit ici, en donnees structurees — pas dans un Google Slides
   ni dans un HTML fige. Une seule source pour la fenetre du site et
   pour le document signe.

   Modifier un article : editer ce fichier, c'est tout.
   ===================================================================== */

import { echapper } from './api.js';

export const REGLEMENT = {
  titre: 'Règlement',
  sousTitre: 'Course de Caisses à Savon du Mont Chiliad',

  signataire: {
    nom: 'Math Baticorte',
    fonction: 'Responsable Événementiel',
    organisation: 'Mairie de San Andréas',
  },

  chapitres: [
    {
      titre: 'Chapitre I — Inscription et participation',
      articles: [
        [1, "L'inscription préalable via le site officiel de l'événement est obligatoire. Le nombre de places est limité ; aucune inscription n'est acceptée sur place."],
        [2, "La présence au briefing d'avant-course et à l'appel des concurrents est obligatoire. Tout concurrent absent à l'appel est déclaré non-partant."],
        [3, "Un numéro de course est attribué à chaque concurrent et doit rester visible pendant toute la durée de l'épreuve."],
      ],
    },
    {
      titre: 'Chapitre II — Véhicules',
      articles: [
        [4, "Les véhicules utilisés seront uniquement ceux fournis par l'organisation."],
        [5, "Toutes les caisses disposeront de la même configuration technique."],
        [6, "L'attribution des caisses est effectuée par tirage au sort."],
        [7, "Une vérification technique est réalisée avant chaque départ par un commissaire et un mécanicien agréé."],
        [8, "Une caisse peut être occupée par un pilote seul, ou par un pilote et un copilote. Aucune autre personne n'est admise à bord."],
        [9, "La caisse est restituée à l'organisation à l'issue de l'épreuve. Toute dégradation volontaire entraîne une sanction et la facturation des réparations."],
      ],
    },
    {
      titre: 'Chapitre III — Départ',
      articles: [
        [10, "Le départ est donné exclusivement par le commissaire de départ. Les départs sont espacés de 10 secondes entre chaque participant. Tout départ anticipé entraîne une pénalité."],
        [11, "L'ordre de départ est fixé par l'organisation et n'est pas négociable."],
      ],
    },
    {
      titre: 'Chapitre IV — Déroulement de la course',
      articles: [
        [12, "L'épreuve se court en une seule descente. Chaque concurrent ne dispose que d'un unique essai ; aucune seconde tentative n'est accordée."],
        [13, "Le parcours est matérialisé par des bornes de passage devant être validées dans l'ordre. Toute borne manquée doit être rattrapée : le concurrent est tenu de revenir la valider avant de poursuivre. Aucun temps n'est validé sans passage complet des bornes."],
        [14, "La durée de course est limitée à 5 minutes. À l'expiration de ce délai, le chronomètre est arrêté et la course prend fin automatiquement."],
        [15, "Les concurrents n'ayant pas franchi la ligne d'arrivée dans le délai imparti sont déclarés non classés."],
        [16, "À l'arrêt du chronomètre, tout concurrent encore en piste doit ramener sa caisse jusqu'au point d'arrivée. Tout véhicule abandonné sur le parcours entraîne l'exclusion de l'événement et le bannissement du concurrent."],
        [17, "En cas de sortie de piste, la caisse est remise en piste par son équipage. Si elle est immobilisée ou jugée dangereuse, le pilote prévient immédiatement un commissaire, qui organise son rapatriement ; l'équipage n'est alors pas sanctionné au titre de l'article 16."],
        [18, "Après un choc important, le contrôle EMS et la vérification technique du véhicule sont obligatoires à l'arrivée de la course."],
        [19, "En cas d'abandon, le concurrent rejoint la zone d'arrivée et remet son véhicule au mécanicien."],
      ],
    },
    {
      titre: 'Chapitre V — Conduite et sécurité',
      articles: [
        [20, "Les collisions légères sont autorisées. Est entendu par là le contact fortuit survenant lors d'un dépassement ou d'une manœuvre de course. Est interdit tout contact intentionnel visant à faire sortir, bloquer ou déséquilibrer un concurrent."],
        [21, "Le sabotage volontaire est strictement interdit."],
        [22, "Les armes sont interdites durant l'événement."],
        [23, "La consommation d'alcool est interdite."],
        [24, "Le port d'un équipement adapté est obligatoire (casque au minimum)."],
        [25, "Les comportements dangereux pourront entraîner une exclusion immédiate."],
        [26, "Le respect des organisateurs, de l'EMS et des forces de l'ordre est obligatoire. Toute insulte ou menace envers un concurrent, un membre de l'organisation ou le public entraîne l'exclusion."],
        [27, "Le public doit rester derrière les barrières. Seuls l'organisation, l'EMS et les forces de l'ordre sont autorisés sur la piste."],
        [28, "Toute intervention de l'EMS marque la fin de la course pour le concurrent concerné. Toute intervention du LSFD entraîne la suspension de la course."],
      ],
    },
    {
      titre: 'Chapitre VI — Chronométrage, classement et réclamations',
      articles: [
        [29, "Seul le temps relevé par le système de chronométrage de l'organisation fait foi."],
        [30, "Toute réclamation est adressée au directeur de course, Math Baticorte, et à lui seul, dans un délai de 15 minutes suivant l'affichage des temps."],
        [31, "Les résultats deviennent définitifs après leur publication officielle sur le site de l'événement."],
        [32, "Les décisions des commissaires sont souveraines et sans appel."],
      ],
    },
    {
      titre: 'Chapitre VII — Sanctions',
      articles: [
        [33, "Selon la gravité des faits, les sanctions suivantes peuvent être prononcées : avertissement, pénalité en secondes, annulation du temps, disqualification, exclusion de l'événement assortie d'un bannissement."],
        [34, "Toute récidive entraîne l'application du degré de sanction immédiatement supérieur."],
      ],
    },
    {
      titre: 'Chapitre VIII — Dispositions générales',
      articles: [
        [35, "Les captations réalisées durant l'événement peuvent être diffusées par la Mairie de San Andréas et ses partenaires."],
        [36, "La participation s'effectue aux risques du concurrent."],
        [37, "L'organisation peut reporter ou annuler l'épreuve si les conditions de sécurité ne sont pas réunies."],
        [38, "L'organisation se réserve le droit de modifier le parcours ou le règlement."],
        [39, "L'inscription vaut acceptation pleine et entière du présent règlement."],
      ],
    },
  ],
};

/* Nombre total d'articles — calcule, jamais saisi a la main : ajouter un
   article ne doit pas obliger a penser a mettre un compteur a jour. */
export function nombreArticles() {
  return REGLEMENT.chapitres.reduce((n, c) => n + c.articles.length, 0);
}

/* Ouvre le reglement dans une fenetre plein ecran, scrollable.
   Pas de lien externe : le texte est deja la, autant l'afficher. */
export function ouvrirReglement() {
  const voile = document.createElement('div');
  voile.className = 'voile';
  voile.innerHTML = `
    <div class="modale modale-doc" role="dialog" aria-modal="true"
         aria-label="Règlement de la course">
      <div class="modale-tete">
        <span class="modale-titre">${echapper(REGLEMENT.titre)}</span>
        <button class="btn-icone pousse" data-fermer aria-label="Fermer">✕</button>
      </div>

      <div class="modale-corps doc">
        <p class="doc-sur">${echapper(REGLEMENT.signataire.organisation)}</p>
        <h2 class="doc-titre">${echapper(REGLEMENT.sousTitre)}</h2>
        <p class="doc-compteur">${nombreArticles()} articles · ${REGLEMENT.chapitres.length} chapitres</p>

        ${REGLEMENT.chapitres.map((c) => `
          <section class="doc-chapitre">
            <h3 class="doc-chapitre-titre">${echapper(c.titre)}</h3>
            ${c.articles.map(([n, t]) => `
              <p class="doc-article">
                <span class="doc-art-num">Art. ${n}</span>${echapper(t)}
              </p>`).join('')}
          </section>`).join('')}

        <div class="doc-signature">
          <p class="doc-sign-nom">${echapper(REGLEMENT.signataire.nom)}</p>
          <p class="doc-sign-fonction">${echapper(REGLEMENT.signataire.fonction)}</p>
          <p class="doc-sign-org">${echapper(REGLEMENT.signataire.organisation)}</p>
        </div>
      </div>

      <div class="modale-pied">
        <button class="btn btn-or" data-fermer>J'ai lu le règlement</button>
      </div>
    </div>`;

  const fermer = () => {
    voile.remove();
    document.removeEventListener('keydown', surTouche);
  };
  const surTouche = (e) => { if (e.key === 'Escape') fermer(); };

  voile.querySelectorAll('[data-fermer]').forEach((b) => { b.onclick = fermer; });
  voile.onclick = (e) => { if (e.target === voile) fermer(); };
  document.addEventListener('keydown', surTouche);

  document.body.appendChild(voile);
  voile.querySelector('.modale-corps').focus?.();
  return fermer;
}
