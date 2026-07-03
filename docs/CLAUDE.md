# CLAUDE.md — Fireball League Manager (FBLM)

## Vision du projet

Jeu de gestion de franchise de basket inspiré de Football Manager. La ligue fictive du jeu est la **FBL (Fireball League)**, calquée sur la structure de la NBA. Le joueur incarne un GM qui doit mener sa franchise au titre, sans fin de jeu (multi-saisons infini). Les matchs ne sont pas affichés visuellement : ils sont **simulés via la data** (possession par possession), avec un mode live (scores/stats temps réel + interventions tactiques) et un mode résultat instantané.

**Anonymisation obligatoire** : aucune donnée réelle (noms de joueurs, équipes, marques, logos NBA) ne doit apparaître dans le code, les données ou les assets. Tout est généré procéduralement. La structure de ligue (30 équipes, 2 conférences, 6 divisions, formats de compétition) est reprise car non protégée.

**Exception villes (décision produit, session P1)** : la FBL est une ligue **mondiale**, pas calquée sur les marchés NBA. Les 30 franchises sont implantées dans de vraies grandes métropoles mondiales (ex. Paris, Tokyo, São Paulo) réparties par continent, et l'`origin` (ville/région d'origine narrative) des joueurs pioche elle aussi dans de vraies villes du monde — un nom de ville réelle n'est pas une donnée protégée. Seuls les surnoms d'équipe (`{Ville} {Surnom}`, ex. "Paris Comets"), les noms de joueurs, et tout ce qui identifie une franchise ou un joueur NBA précis (nom réel, logo, palette) restent strictement fictifs/anonymisés. Conférences = hémisphères (Nord/Sud), divisions = continents (Amérique du Nord, Europe, Asie / Amérique du Sud, Afrique, Océanie).

## Stack technique

- **Langage** : JavaScript/TypeScript, Node.js
- **Moteur de simulation** : 100 % headless, aucune dépendance UI. Doit pouvoir tourner en batch CLI.
- **Données** : fichiers JSON en phase prototype (pas de BDD tant que non nécessaire)
- **UI** : découplée du moteur, décidée plus tard. Ne jamais mettre de logique de jeu dans l'UI.
- **Multi-plateforme** : le jeu doit être jouable sur desktop, tablette ET téléphone. Toute UI est conçue responsive dès le départ (mobile-first sur les écrans denses : tableaux scrollables, colonnes prioritaires, cibles tactiles ≥ 44px). Le découplage moteur/UI garantit que cette contrainte ne touche jamais le moteur.
- **Tests** : tests unitaires sur chaque règle + harnais de simulation batch (voir plus bas)

## Architecture — principes non négociables

1. **Moteur headless découplé de l'UI.** Le moteur expose une API ; l'UI ne fait que consommer et proposer des actions.
2. **Seed reproductible partout.** Tout tirage aléatoire passe par un RNG seedé injecté (jamais `Math.random()` direct). Une même seed doit produire exactement la même ligue et les mêmes saisons.
3. **Une source de vérité par règle.** Toute transaction (signature, trade, waiver) sera validée par un module unique `cba-engine` (phase 5). L'UI et l'IA des GM passent par lui, sans exception.
4. **Le harnais batch est un produit.** `npm run batch -- --seasons=50 --seed=X` doit simuler N saisons et sortir des distributions statistiques (points, wins, salaires, âges). C'est l'outil d'équilibrage de chaque phase.
5. **Simulation événementielle.** Un match est une séquence d'événements de possession (log play-by-play), les box scores et stats avancées sont dérivés de ce log, jamais calculés à part.

## Structure cible du repo

```
/engine          # moteur headless (le cœur)
  /generation    # génération procédurale : ligue, villes, joueurs, classes de draft
  /simulation    # moteur de match (possessions), fatigue, blessures
  /season        # calendrier, classement, playoffs, événements annuels
  /players       # attributs, archétypes, progression, vieillissement
  /market        # draft, free agency, trades, IA des GM
  /cba           # cba-engine : contrats, cap, exceptions, validation (phase 5)
  /economy       # BRI, revenus franchise, propriétaire (phase 6)
/batch           # harnais de simulation batch + rapports statistiques
/data            # JSON : ligue courante, sauvegarde, tables de référence
/ui              # interface (plus tard, techno à décider)
/docs            # GDD, plan de développement, décisions d'architecture
```

## Plan de développement (couches d'oignon)

Chaque phase livre un jeu jouable complet, validé en batch avant de passer à la suivante. Le détail complet est dans `docs/plan-developpement.md`.

- **Phase 1 (en cours)** : moteur de simulation + saison complète. Génération de 30 équipes/joueurs (attributs minimaux : tir 2pts, tir 3pts, passe, rebond, défense, physique), match possession par possession, saison 82 matchs, classement, playoffs. Validation : moyennes ~110-120 pts, meilleurs scoreurs ~25-32 pts, avantage domicile ~55-60 %, saison simulée en < 1 min.
- **Phase 2** : tactiques (pace, orientation 3pts, agressivité défensive), rotations/minutes, fatigue, blessures, mode match live avec interventions.
- **Phase 3** : draft (lottery + 2 tours), scouting avec incertitude, progression/vieillissement/retraites, classes de draft générées, Summer League. Validation : ligue crédible après 20 saisons batch.
- **Phase 4** : contrats simplifiés (montant + durée, cap dur), free agency UFA, exigences salariales, IA des 29 GM (rebuild/contender/win-now), trades simples, confiance du propriétaire (licenciement = game over).
- **Phase 5** : cap NBA complet via `cba-engine` — soft cap, Bird Rights, MLE/BAE, luxury tax + aprons 1 & 2, cap holds, RFA/qualifying offers, rookie scale, max/supermax, options, trades complets (matching, TPE, Stepien, protections de picks), two-way, waivers, stretch.
- **Phase 6** : économie macro — BRI → calcul dynamique du cap, revenus locaux (billetterie, TV, sponsors selon attributs de marché des villes fictives), revenue sharing, profils de propriétaires, All-Star, NBA Cup, awards (liés à l'éligibilité supermax), marché du staff.

**Règle de scope : ne jamais implémenter un élément d'une phase future pendant la phase courante.** Si une abstraction est nécessaire pour préparer l'avenir (ex. structure `Contract` extensible), la noter dans `docs/decisions.md` mais garder l'implémentation minimale.

## Conventions de code

- TypeScript strict, pas de `any` non justifié
- Entités du domaine : `Player`, `Team`, `Game`, `Season`, `Contract`, `DraftPick`, `Franchise`
- Les fonctions de simulation sont **pures** autant que possible : `(state, rng) => newState + events`
- Toutes les probabilités et constantes d'équilibrage sont centralisées dans `/engine/config/tuning.ts` (jamais de magic numbers dans la logique)
- Chaque règle du CBA implémentée = un test unitaire nommé d'après la règle
- Commits en français, préfixés par la phase : `[P1] simulation des possessions`

## Identité visuelle

- **Logo principal** (`/ui/assets/logo-fbl.png`) : dunk d'un ballon enflammé dans un cercle — usage écrans d'accueil, splash, branding in-game de la ligue
- **Logo simplifié** (`/ui/assets/logo-fbl-icon.png`) : ballon enflammé sur main, fond transparent — usage favicon, icône d'app, headers, petits formats
- **Palette** : fond noir profond (#0D0D0D), accents orange/rouge feu (#FF6B1A / #E63312), jaune flamme (#FFC93C), texte crème (#F5EFE0)
- **Ton** : cartoon vectoriel énergique, contours marqués. L'UI du jeu (quand elle viendra) s'appuie sur cette palette : fond sombre, orange pour les actions/CTA, crème pour la lecture.
- La marque FBL (logos, trophées, awards) est la seule identité visible in-game.

## Boucle annuelle de référence (calendrier du jeu)

Lottery → Draft → Free Agency (moratoire puis signatures) → Summer League → Training camp/Présaison → Saison régulière → **FBL Cup** (tournoi in-season, équivalent NBA Cup) → Trade deadline → All-Star Weekend → Fin de saison régulière → Play-in (7e-10e) → Playoffs → Finales FBL → Awards → intersaison (options, qualifying offers, extensions).

**Nommage in-game** : toute référence visible par le joueur utilise la marque FBL (FBL Cup, Finales FBL, All-Star FBL...). Les termes "NBA" ne servent que de référence de conception dans la documentation, jamais dans le code ni les contenus du jeu.

## Ce que Claude Code doit toujours vérifier avant de coder

1. Dans quelle phase du plan se situe la tâche ? Ne pas dépasser son scope.
2. Le code touche-t-il au moteur ? → headless, seedé, testable en batch.
3. Y a-t-il un tirage aléatoire ? → RNG injecté obligatoire.
4. Une constante d'équilibrage apparaît ? → la mettre dans `tuning.ts`.
5. Après toute modification de la simulation : relancer le batch et comparer les distributions aux critères de validation de la phase.
