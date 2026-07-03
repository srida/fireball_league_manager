# Plan de développement — Jeu de gestion basket (FM version NBA)

Approche en couches d'oignon : chaque phase livre un jeu jouable complet, testable en batch (simulation de dizaines de saisons) avant d'ajouter la couche suivante.

---

## Phase 1 — Moteur de simulation + saison

**Objectif :** valider que la simulation produit du basket crédible. C'est le go/no-go du projet.

**Contenu**
- Génération de 30 équipes fictives (2 conférences, 6 divisions) avec noms/villes procéduraux
- Joueurs générés avec un set d'attributs minimal : tir 2pts, tir 3pts, passe, rebond, défense, physique
- Simulation de match possession par possession (sans tactiques, rotations automatiques naïves)
- Calendrier de 82 matchs, classement, playoffs au format NBA (best-of-7), un champion
- Box scores et stats de base (pts, reb, ast, %, minutes)

**Plan d'implémentation**
1. Modèle de données `Player`, `Team`, `Game` (JSON simple, pas de BDD)
2. Générateur procédural de ligue (seed reproductible pour les tests)
3. Algo d'une possession : qui a la balle → action (tir/passe/turnover) → résolution probabiliste pondérée par les attributs
4. Boucle de match : alternance de possessions, horloge, score, accumulation des stats
5. Boucle de saison : calendrier round-robin pondéré (division/conférence), classement, tie-breakers
6. Bracket playoffs + simulation des séries
7. **Harnais de test batch** : simuler N saisons, sortir les distributions statistiques

**Critères de validation**
- Moyennes d'équipe ~110-120 pts, meilleurs scoreurs ~25-32 pts/match
- Avantage du terrain ~55-60 % de victoires à domicile
- Écart réaliste entre meilleure (~60 wins) et pire équipe (~15 wins)
- Une saison complète simulée en < 1 minute (indispensable pour la suite)

---

## Phase 2 — Tactiques, rotations, fatigue, blessures

**Objectif :** donner au GM ses premiers leviers pendant les matchs. Premier vrai gameplay.

**Contenu**
- Profils tactiques : pace (lent/rapide), orientation 3pts vs intérieur, agressivité défensive, pressing
- Gestion des rotations : 5 majeur, minutes cibles par joueur, hiérarchie de banc
- Fatigue intra-match et inter-matchs (back-to-backs), impact sur les attributs
- Blessures probabilistes (liées à la fatigue, l'âge, un attribut de fragilité) avec durées d'absence
- Mode match live : score et stats en temps réel, temps-morts, changements, ajustements tactiques
- Mode simulation instantanée du résultat

**Plan d'implémentation**
1. Étendre l'algo de possession pour intégrer les modificateurs tactiques
2. Système de fatigue : jauge par joueur, décroissance selon minutes/intensité, récupération selon calendrier
3. Moteur de rotations automatiques respectant les consignes du GM
4. Système de blessures + table de types de blessures/durées
5. UI de match live (même minimaliste : flux texte + score) avec pause/intervention
6. IA tactique basique pour les 29 autres équipes
7. Rééquilibrage batch : vérifier que fatigue/blessures ne cassent pas les distributions de la phase 1

**Critères de validation**
- Deux profils tactiques opposés produisent des stats visiblement différentes
- ~4-6 blessures significatives par équipe et par saison
- Le choix des rotations a un impact mesurable sur les résultats

---

## Phase 3 — Draft, progression, vieillissement

**Objectif :** rendre le multi-saisons vivant. Les joueurs naissent, progressent, déclinent, partent à la retraite.

**Contenu**
- Attributs cachés : potentiel, courbe de développement, éthique de travail
- Progression annuelle (et en cours de saison selon minutes jouées) + déclin avec l'âge
- Retraites, génération d'une nouvelle classe de draft chaque année
- Draft lottery (odds pondérées par le classement inversé), draft en 2 tours
- Scouting simplifié : incertitude sur les attributs des prospects (fourchettes)
- Summer League comme vitrine des rookies

**Plan d'implémentation**
1. Courbes de carrière par archétype (pic ~26-29 ans, déclin variable)
2. Générateur de classes de draft avec distribution de talent variable (bonnes/mauvaises cuvées)
3. Algo de lottery + ordre de draft complet
4. IA de draft des autres équipes (besoins + meilleur talent disponible)
5. Système de scouting : précision des évaluations en fonction de l'investissement
6. Simulation batch sur 20 saisons : vérifier l'équilibre démographique de la ligue (âge moyen stable, renouvellement des stars)

**Critères de validation**
- La ligue reste équilibrée et crédible après 20 saisons simulées
- Des dynasties émergent et meurent naturellement
- Les busts et les steals de draft existent (l'incertitude fonctionne)

---

## Phase 4 — Contrats simplifiés, free agency, IA des GM

**Objectif :** introduire l'économie des effectifs sans la complexité complète du cap.

**Contenu**
- Contrats : montant + durée uniquement, salary cap dur (pas d'exceptions), salary floor
- Free agency : UFA uniquement, joueurs choisissant selon argent/rôle/ambition de l'équipe/marché
- Exigences salariales dérivées des performances et de l'âge
- IA des 29 GM avec stratégies : rebuild, contender, win-now, gestion de leur masse salariale
- Trades simples (joueur contre joueur + picks, validation par matching approximatif)
- Confiance du propriétaire : objectifs de saison, licenciement possible (game over)

**Plan d'implémentation**
1. Modèle `Contract` (montants par année, années restantes) rattaché au cap sheet d'équipe
2. Moteur d'évaluation de la valeur d'un joueur (perfs récentes, âge, potentiel) — brique réutilisée partout
3. Algo de décision des free agents (scoring multi-critères des offres)
4. Machine à états des stratégies GM + logique d'offres/contre-offres
5. Moteur de proposition et d'évaluation de trades (IA acceptant/refusant/contre-proposant)
6. Système d'objectifs du propriétaire et jauge de confiance
7. Batch : vérifier qu'aucune IA ne se retrouve dans un état absurde (cap explosé, roster de 8 joueurs)

**Critères de validation**
- Les stars signent majoritairement chez des contenders ou des gros marchés
- Les masses salariales des 30 équipes restent dans des bornes réalistes sur 20 saisons
- Les trades IA-IA sont défendables aux yeux d'un joueur humain

---

## Phase 5 — Cap complet NBA

**Objectif :** la profondeur stratégique qui fait le sel du genre. Remplacer le cap dur par le vrai système.

**Contenu**
- Soft cap + exceptions : Bird Rights (Full/Early/Non), MLE (3 variantes), BAE, minimums
- Luxury tax progressive + repeat offender, premier et second apron avec leurs restrictions
- Cap holds, renonciations, qualifying offers, RFA avec droit de matcher
- Contrats complets : rookie scale, max/supermax (lié aux awards), options (player/team), garanties partielles, no-trade clauses, extensions
- Trades complets : matching salarial par paliers, agrégation, TPE, sign-and-trade, règle Stepien, protections de picks
- Two-way contracts, 10-day contracts, waivers, stretch provision, G League

**Plan d'implémentation**
1. Refactorer `Contract` et le cap sheet vers le modèle complet (types d'exception, Bird years, options)
2. Moteur de validation des transactions : une seule fonction source de vérité qui autorise/refuse toute signature ou trade (le "CBA engine")
3. Implémenter les exceptions une par une, avec tests unitaires par règle
4. Calcul de la tax et des aprons + restrictions associées dans le validateur
5. Mettre à jour l'IA des GM pour raisonner avec les exceptions (priorité Bird Rights, usage de la MLE)
6. RFA : mécanique d'offer sheets et de matching
7. Batch : vérifier que les IA exploitent les exceptions sans exploits dégénérés

**Critères de validation**
- Zéro transaction illégale possible (le validateur est exhaustif)
- Les patterns NBA émergent : équipes coincées au second apron, re-signatures Bird massives, MLE comme outil principal des contenders

---

## Phase 6 — Économie macro et méta-jeu

**Objectif :** boucler le système avec la couche financière ligue/franchise et les événements de prestige.

**Contenu**
- BRI : droits TV, sponsors ligue → calcul dynamique du cap chaque saison (croissance, cap spikes)
- Revenus locaux : billetterie (prix des places, affluence liée aux résultats), TV locale, sponsors, loges
- Attributs de marché des villes fictives (taille, ferveur, fiscalité) influençant revenus et attractivité
- Revenue sharing et redistribution de la tax
- Personnalité et budget du propriétaire (dépensier/frugal), négociation d'investissements (salle, staff, scouting)
- Événements de prestige : All-Star Weekend, NBA Cup, awards complets (MVP, DPOY, All-NBA, ROY, 6MOY)
- Staff complet : marché des coachs/scouts/médical avec impact sur développement, tactiques, blessures

**Plan d'implémentation**
1. Modèle économique de la ligue : revenus globaux → BRI → formule du cap (avec lissage/smoothing)
2. Modèle de revenus par franchise (fonctions de l'affluence, du marché, des résultats)
3. Générateur de profils de propriétaires + arbre de décisions budgétaires
4. Systèmes d'événements du calendrier (All-Star : sélections basées sur les stats, NBA Cup : format poules + finale)
5. Moteur d'awards (scoring statistique + narratif) branché sur l'éligibilité supermax
6. Marché du staff avec attributs et effets mesurables
7. Batch final : 50 saisons, vérifier la stabilité économique (inflation du cap réaliste, pas de faillites absurdes)

**Critères de validation**
- Le cap croît de façon plausible (~5-10 %/an avec des à-coups)
- Les petits marchés restent compétitifs via le draft et le revenue sharing
- Toutes les boucles de rétroaction du modèle système sont actives

---

## Principes transverses (toutes phases)

- **Seed reproductible** partout : indispensable pour débugger la simulation
- **Le harnais de test batch est un produit** : l'entretenir à chaque phase, c'est ton outil d'équilibrage
- **Une source de vérité par règle** : le CBA engine (phase 5) valide tout, l'UI ne fait que proposer
- **Anonymisation dès la phase 1** : générateurs de noms/villes/logos fictifs, aucune donnée réelle dans le code
- **Découpler simulation et UI** : le moteur doit tourner en headless (tests batch, et liberté future sur la techno d'interface)
