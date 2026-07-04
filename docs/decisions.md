# Décisions d'architecture et de scope (FBLM)

> CLAUDE.md : "Si une abstraction est nécessaire pour préparer l'avenir... la
> noter dans `docs/decisions.md` mais garder l'implémentation minimale."
> Ce fichier recense aussi les cas où une spec ne fixait pas un détail chiffré
> ou une règle exacte, et où Claude Code a dû trancher pour pouvoir coder.
> Chaque entrée : contexte → décision → pourquoi → fichier(s) concerné(s).

---

## Phase 1 — Moteur de possession

### Turnover "précoce" (machine à états, spec-possession-algorithm §2)
Le diagramme de la spec montre une branche `SÉLECTION DU PORTEUR → turnover
précoce → FIN`, distincte de la branche `CHOIX D'ACTION → TURNOVER`. La spec
ne détaille ni mécanisme ni constante séparée pour ce "turnover précoce".
**Décision** : traité comme la même branche TURNOVER du choix d'action (le
premier choix d'action après la sélection du porteur peut être un turnover —
c'est exactement ce que le diagramme représente, sans mécanisme dupliqué).
→ `engine/simulation/possession.ts`

### Modificateurs du choix d'action non chiffrés (spec §4, tableau)
La spec décrit qualitativement les modificateurs ("+ si attributs de tir hauts
vs défenseur", etc.) sans donner de poids. **Décision** : nouvelles constantes
`ACTION_MODIFIERS` dans `tuning.ts` (poids initiaux, marqués "à calibrer"),
curseurs du batch de calibration (Session D).
→ `engine/config/tuning.ts`, `engine/simulation/possession.ts`

### Biais putback non chiffré (spec §7 : "fortement augmenté")
**Décision** : constante `PUTBACK.rimBiasMultiplier` (valeur initiale à
calibrer), même logique que ci-dessus.
→ `engine/config/tuning.ts`

### Cause "OFFENSIVE_FOUL" du turnover sans `discipline` (mental, P2 only)
La spec lie la faute offensive à `discipline` (mental), mais `mental` n'est
actif qu'à partir de P2 (spec-player-model §9). **Décision** : poids de base
constant (`turnoverOffensiveFoulBaseWeight`) non piloté par un attribut en P1 ;
à remplacer par un vrai modificateur `discipline` dès que le mental s'active
(Phase 2, session pression/mental).
→ `engine/config/tuning.ts`, `engine/simulation/possession.ts`

### Ajout de `blockedBy` à l'événement SHOT (types/event.ts)
La spec ne prévoyait pas ce champ, mais sans lui le contre est incomptabilisable
pour le contreur à partir du seul log — violerait "stats jamais calculées à
part du log" (CLAUDE.md, principe simulation événementielle). **Décision** :
champ optionnel ajouté, peuplé uniquement quand `result === "BLOCK"`.
→ `engine/types/event.ts`, `engine/simulation/possession.ts`

## Phase 1 — Boucle de match et box score

### Modèle de minutes P1 ("naïf", spec-possession §10)
Lecture initiale erronée : un facteur arbitraire ×0,75 avait été appliqué
(interprétant "5 majeurs jouent ~36 min" littéralement). **Décision finale**,
corrigée après échec du test de propriété officiel (`minutes d'équipe == 240
±25/OT`, spec-tests-phase1 §2) : en P1 sans rotations, personne ne sort donc
les minutes sont simplement la durée réelle du match — "naïf" décrit l'absence
de simulation par possession des rotations, pas une réduction arbitraire.
→ `engine/simulation/game.ts`

### ORtg/DRtg simplifiés au niveau équipe (spec §9)
Le basket réel *estime* le nombre de possessions (les formules ORtg/DRtg de
Dean Oliver existent pour ça). Notre moteur événementiel connaît le nombre
exact de possessions jouées. **Décision** : `ORtg = 100 × points / possessions`
exact, au niveau équipe uniquement (pas de version individuelle Dean-Oliver,
jugée hors scope P1 pour un gain de précision marginal).
→ `engine/simulation/boxScore.ts`

## Phase 1 — Saison, classement, playoffs

### Construction du calendrier (82 matchs, spec-tests-phase1 §1)
Aucune spec ne fixait le détail de la pondération division/conférence/hors-
conférence. **Décision** : réplique la structure standard NBA (4 divisions
rivales ×4 matchs, 6 adversaires de conférence "renforcés" ×4 + 4 adversaires
de conférence "de base" ×3, 15 adversaires hors-conférence ×2 = 82), mais via
une construction combinatoire propre (graphe circulant sur Z5 par paire de
divisions d'une même conférence) plutôt que la table historique arbitraire de
la vraie NBA. Cette construction garantit mathématiquement 41 dom/41 ext exacts
pour les 30 équipes (démontré et vérifié par test, pas juste approximé).
→ `engine/season/schedule.ts`

### Ordre des tie-breakers du classement (spec-tests-phase1 §1)
Aucune spec ne fixait l'ordre exact des critères de départage. **Décision**,
ordre standard NBA simplifié (les procédures multi-équipes réelles de la NBA
sont beaucoup plus complexes et jugées hors scope P1) :
1. Pourcentage de victoires
2. Confrontations directes (mini-classement entre équipes à égalité stricte)
3. Pourcentage de victoires en division (si même division)
4. Pourcentage de victoires en conférence (si même conférence)
5. Différentiel de points
6. Départage déterministe (hash de l'id d'équipe, jamais `Math.random`)
→ `engine/season/standings.ts`

### Format play-in et bracket playoffs
CLAUDE.md nomme explicitement "Play-in (7e-10e)" dans la boucle annuelle et la
structure de ligue reprend le format NBA (non protégé). **Décision** : format
standard NBA repris tel quel — 7v8 (vainqueur = 7e seed) / 9v10, puis perdant
du 7v8 contre vainqueur du 9v10 pour la 8e place ; bracket 1-8/2-7/3-6/4-5,
avantage du terrain 2-2-1-1-1, série à 4 victoires.
→ `engine/season/playoffs.ts`

### Avantage du terrain en Finales FBL — seeds comparables inter-conférences
Le rang de conférence (1-8) n'est comparable qu'au sein d'une même conférence.
**Décision** : `runFinals` attend des `seed` déjà comparables entre conférences
(ex. rang au classement général de la ligue), à la charge de l'appelant de les
calculer — documenté dans le JSDoc de la fonction plutôt que codé en dur, pour
rester découplé de la source du classement.
→ `engine/season/playoffs.ts`, `engine/season/season.ts`

## Phase 1 — Batch, calibration (Session D)

### Bugs corrigés avant de pouvoir calibrer quoi que ce soit
Trois bugs réels (pas des questions de calibration) découverts en construisant
le harnais batch :
1. `season.ts` ne récupérait pas `game.events` de `simulateGame` (toujours `[]`)
   — toutes les métriques dérivées du log (FG%, TO, rebonds...) étaient à zéro
   ou `NaN`. Corrigé en propageant `events` depuis `RealGameResult`.
2. `topScorerPpg` divisait par un `82` fixe un total de points accumulé sur
   *toutes* les saisons du batch au lieu d'une seule (3 saisons batchées
   donnaient un "meilleur scoreur" à 120 pts/match). Corrigé : reset de
   l'accumulateur de points par joueur à chaque saison.
3. **OOM réel sur 50 saisons** (CLAUDE.md exige "heap stable") : `batch/run.ts`
   retenait tous les `SeasonResult[]` (logs complets de ~1230 matchs × saison)
   simultanément en mémoire avant de calculer les métriques. Corrigé par un
   accumulateur streaming (`BatchAccumulator`, `batch/metrics.ts`) : chaque
   saison est consommée puis devient éligible au GC immédiatement.
→ `engine/season/season.ts`, `batch/metrics.ts`, `batch/run.ts`

### Deux tables de cibles distinctes (calibration vs test automatisé)
`spec-tests-phase1.md §3` cite "les cibles de la spec possession §11" mais
donne en réalité des bornes **plus larges** que celles de `spec-possession-
algorithm.md §11` (ex. points/équipe/match 108-122 vs 110-120). **Décision** :
les deux tables sont gardées séparées dans `tuning.ts` — `LEAGUE_TARGETS`
(bornes serrées, guide la calibration manuelle et `batch/run.ts`) et
`STATISTICAL_TEST_TARGETS` (bornes larges, utilisées par le test automatisé
famille 3 pour éviter un test flaky sur de la variance statistique normale).
→ `engine/config/tuning.ts`, `tests/statistical/league-distributions.test.ts`

### Bugs de calibration réels trouvés en creusant les métriques hors cible
Deux métriques largement hors cible n'étaient **pas** de simples réglages fins :
- **Turnovers ~22 % par possession au lieu de ~9 % attendu** : les probabilités
  de base (spec §4) s'appliquent à *chaque* décision d'action, pas une fois par
  possession — une possession avec plusieurs passes cumule plusieurs tirages
  indépendants, ce qui compose le taux de turnover bien au-delà du taux par-
  décision. Rebaissé `ACTION_PROBABILITY.base.turnover` (0.09 → 0.062) pour
  compenser la composition sur ~2,6 décisions/possession en moyenne.
- **~120 possessions/équipe/match au lieu de ~99 ciblées** : conséquence du
  taux de turnover excessif (des possessions qui se terminent vite libèrent du
  temps de jeu pour plus de possessions). Une fois le turnover corrigé, il
  restait encore un écart : la fourchette de `CLOCK_CONSUMPTION.setup` (spec
  4-8s) ne suffisait pas à consommer assez d'horloge — allongée à 6-11s.
→ `engine/config/tuning.ts`

### Corrélation talent→wins instable d'une seed de ligue à l'autre (gap connu, non résolu)
Mesurée entre 0.42 et 0.78 selon la seed de génération de ligue et le nombre de
saisons batchées, malgré plusieurs passes de calibration sur `attackFactorK`/
`defenseFactorD` (spec §6.1). Deux causes identifiées :
1. **Bug corrigé** : la note d'équipe utilisée pour la corrélation moyennait
   les 15 joueurs du roster alors que seuls les 5 titulaires jouent en P1 (pas
   de rotations) — corrigé (`teamOverallRating` utilise `pickStartingFive`),
   amélioration significative mais insuffisante seule.
2. **Non résolu** : `batch/calibrate.ts` montre que la relation entre
   `attackFactorK` et la corrélation mesurée n'est *pas* monotone ni stable
   d'une ligue à l'autre (une valeur plus faible donne parfois une meilleure
   corrélation) — le signal semble dominé par la composition aléatoire des 30
   rosters plus que par ce curseur. Valeur retenue : `attackFactorK=0.6`,
   `defenseFactorD=0.5` (compromis, sans sur-optimiser sur une seed précise).
Spec-tests-phase1 §3 autorise explicitement cette famille de tests à tourner
en *warning* "en calibration en cours" avant de devenir bloquante — c'est
l'état actuel (`tests/statistical/league-distributions.test.ts`), à revisiter
avant de déclarer la Phase 1 définitivement stable.
→ `engine/config/tuning.ts`, `batch/metrics.ts`, `batch/calibrate.ts`,
`tests/statistical/league-distributions.test.ts`

### Meilleur scoreur ligue toujours au-dessus de la cible (~35-37 pts/match vs ≤35, gap connu)
Persiste quelle que soit la valeur testée pour `attackFactorK`/`defenseFactorD`
(y compris à la valeur spec d'origine 0.35) — donc pas principalement piloté
par la sensibilité du tir. Hypothèse retenue mais non vérifiée : en P1 sans
fatigue ni rotations (spec-possession §10), un joueur à fort volume d'usage
joue les 48 minutes sans ralentissement ni ajustement défensif adverse
(double-team, changement de matchup) — les deux leviers qui, en Phase 2,
tempèrent naturellement la domination d'un seul joueur. Même statut "warning"
que la corrélation ci-dessus ; à réévaluer une fois fatigue/rotations actives.
→ `tests/statistical/league-distributions.test.ts`

**Mise à jour Phase 2 Session 1 (rotations actives)** : l'hypothèse était
partiellement correcte mais le gap s'est inversé plutôt que résorbé — le
meilleur scoreur ligue est passé de ~35-37 pts/match (trop haut) à ~23-25
pts/match (trop bas, cible 26-35). Les rotations réduisent les minutes des
titulaires (~28-34 min réels au lieu de 48 min fixes en P1), ce qui réduit
mécaniquement le volume de tirs disponible plus qu'un simple ralentissement
défensif ne l'aurait fait. Reste en "warning" ; probablement à retempérer via
`ROTATION.targetMinutesByRank` (titulaires vedettes un peu plus haut) ou via
`USAGE`/`ACTION_PROBABILITY` une fois la pression/mental (Session 3) en place,
plutôt qu'en touchant `attackFactorK` à nouveau.
→ `engine/config/tuning.ts` (`ROTATION`), `engine/simulation/rotation.ts`

## Phase 2 — Tactiques et rotations (Session 1)

### Assignation tactique IA : seuils absolus abandonnés au profit d'une comparaison relative
Première implémentation : orientation offensive (`THREE_POINT`/`BALANCED`/`INSIDE`)
décidée par seuils absolus sur `threePoint` (guards/wings) vs moyenne
`postPlay`+`strength` (intérieurs). Résultat : 23/30 équipes classées `INSIDE`
et le batch de contrôle cassait la cible "part de tirs à 3pts" (32% vs 36-44%).
Cause : `strength` est physique et élevé chez quasi tous les intérieurs
indépendamment de leur identité offensive, donc le seuil absolu déclenchait
presque toujours. **Décision** : comparaison relative `threePointAvg −
postPlayAvg(intérieurs)` (retrait de `strength` du calcul) avec une marge
(`TACTIC_ASSIGNMENT.offensiveOrientationMargin = 3`) — distribution obtenue sur
la ligue de test : 11 `INSIDE` / 12 `BALANCED` / 7 `THREE_POINT`, cible 3pts
revenue à ~40%.
→ `engine/simulation/tactics.ts`, `engine/config/tuning.ts`

### Rotations : garde-fou de "stint minimum" ajouté (non prévu explicitement par la spec)
La logique de substitution sur rythme de minutes cibles (vérifiée à chaque
possession, décision produit Session 1) oscillait violemment sans garde-fou :
un joueur de banc à faible cible de minutes dépasse son rythme après ~2 min de
jeu continu, produisant ~880 substitutions par match (vs ~30-40 réalistes) et
un surcoût de performance (~57 ms/match contre ~18 ms après correctif).
**Décision** : ajout de `ROTATION.minimumStintSeconds` (5 min) — un joueur ne
peut être sorti pour rythme de minutes qu'après un passage minimum sur le
terrain ; ne s'applique pas au foul-out (toujours immédiat) ni à la mise au
repos pour fautes précoces. Ramène les substitutions à ~35-40/match des deux
équipes cumulées.
→ `engine/config/tuning.ts` (`ROTATION.minimumStintSeconds`), `engine/simulation/rotation.ts`

## Phase 2 — Fatigue et blessures (Session 2)

### Modèle de repos inter-matchs : proxy stochastique, pas de calendrier à jours
`schedule.ts` ne porte aucune date réelle (juste une liste ordonnée de
fixtures) : pas de moyen natif de détecter un vrai back-to-back. Deux options
présentées à l'utilisateur ; **décision (validée)** : un flag back-to-back est
tiré aléatoirement par match et par équipe (`FATIGUE.backToBackRate = 0.16`),
sans jours/dates réels — un vrai calendrier à jours (algorithme glouton
d'assignation, sans double-réservation d'équipe) est jugé plus à sa place avec
le mode match live (Session 4), où une notion de date devient de toute façon
nécessaire pour l'UI.
→ `engine/config/tuning.ts` (`FATIGUE`), `engine/season/season.ts` (`playRealGame`)

### Granularité du contrôle de blessure : à chaque possession
Décision validée : le risque de blessure est vérifié à chaque possession pour
chaque joueur sur le terrain (même logique que le suivi des fautes déjà en
place depuis la Session 1), plutôt qu'un tirage unique en fin de match — capture
le moment exact dans le play-by-play (événement `INJURY`) et permet une sortie
forcée immédiate réaliste, cohérent avec l'architecture event-sourced.
→ `engine/simulation/fatigue.ts` (`checkInjuries`)

### Trait "Guerrier" (retour de blessure plus rapide, joue mieux fatigué) — reporté à la Session 3
Le bloc mental/traits est explicitement prévu pour la Session 3 (pression et
mental) ; décision validée : ne pas fragmenter cette logique entre deux
sessions, même si "Guerrier" touche directement fatigue/blessure. `mental.traits`
n'est lu par aucune formule de fatigue/blessure pour l'instant.
→ activé en Session 3, voir "Trait Guerrier" plus bas (`engine/simulation/mental.ts`)

### `gameStaminaFactor` lit désormais un état de simulation vivant, pas `player.state`
En P1/Session 1, `gameStaminaFactor` était appelé avec `player.state.gameStamina`
— une valeur figée à la génération (toujours 100, jamais mise à jour). Cette
Session 2 introduit `GameState.gameStamina : Record<playerId, number>`, décroissant
pour les joueurs sur le terrain et récupérant pour ceux au banc à chaque
possession (`applyFatigueDrain`), au même titre que `cumulativeSeconds` en
rotation.ts (état de simulation dérivé, jamais recalculé depuis le log
d'événements). `player.state.gameStamina` reste donc un champ figé/inutilisé
par le moteur — seule la `fitness` de fin de saison précédente (portée par
`season.ts`) initialise la valeur de départ d'un match.
→ `engine/types/game.ts`, `engine/simulation/fatigue.ts`, `engine/simulation/possession.ts`, `engine/simulation/game.ts`

### Persistance saison de la fatigue/blessures : fermeture stateful dans `season.ts`, moteur de match resté pur
`simulateGame`/`resolvePossession` restent des fonctions pures (aucune
mutation de `Player`) : `simulateGame` renvoie en plus les blessures survenues
(`injuries`) et les minutes réellement jouées (déjà exposées en Session 1).
`season.ts` (`playRealGame`) est la seule couche qui fait persister `fitness`
(usure/récupération inter-matchs) et le décompte des matchs d'indisponibilité
après blessure — la même fermeture est réutilisée pour la saison régulière, le
play-in et les playoffs, donc la fatigue accumulée compte aussi en playoffs.
Les durées de blessure sont exprimées en **matchs manqués**, pas en jours
calendaires (même raison que le proxy back-to-back ci-dessus).
→ `engine/season/season.ts`

### Calibration : probabilité de blessure ajustée après batch de contrôle
Cible plan-développement : ~4-6 blessures significatives par équipe et par
saison. Premier batch de contrôle (10 saisons, seed `fblm-session2-control`) :
6.3/équipe/saison avec `INJURY.baseProbPerPossession = 0.00006`. Ajusté à
`0.00005` (×0.83) → 5.1/équipe/saison sur un second batch de contrôle, dans la
cible `LEAGUE_TARGETS.injuriesPerTeamPerSeason` [4-6].
→ `engine/config/tuning.ts` (`INJURY.baseProbPerPossession`)

## Phase 2 — Pression et mental (Session 3)

### Contexte de pression (base(typeMatch)) : tiers simplifiés par type de match, pas de standings en direct
Décision produit validée : `pressureScore` (spec §7) utilise une base par
`GameTier` (`REGULAR_SEASON`/`PLAY_IN`/`PLAYOFFS`/`FINALS`) plus des bonus
`clutchTime`/`eliminationStake`/`game7`, tous connus au niveau du match sans
consulter le classement en direct. Une modélisation "course au play-in/playoffs"
consciente des standings de saison régulière (ex. pression accrue pour une
équipe à la lutte pour la 8e place en avril) est explicitement hors scope —
nécessiterait de faire transiter les standings courants dans la fermeture de
match de `season.ts`, une portée plus large que ce que la Session 3 couvre. De
même, le "rivalité / affluence hostile (extérieur)" de la spec §7 est hors
scope : aucun système de rivalité/affluence n'existe dans le moteur.
→ `engine/config/tuning.ts` (`PRESSURE.baseByGameTier`), `engine/simulation/mental.ts` (`computePressureContext`)

### Élimination/Game 7 dérivés du score de série en cours, pas d'un flag précalculé
`isEliminationGame` (une défaite ce soir élimine au moins une équipe) et
`isGame7` sont calculés à la volée dans `simulateSeries` (playoffs.ts), à
partir des compteurs `higherWins`/`lowerWins` déjà tenus par la boucle
existante — élimination dès qu'une équipe atteint 3 victoires, Game 7 à 3-3.
Pour le play-in, le match 7v8 n'élimine personne (le perdant rejoue le match
décisif) ; 9v10 et le match décisif éliminent bien le perdant de la saison.
→ `engine/season/playoffs.ts` (`simulateSeries`, `runPlayIn`)

### Traits scopés à la Session 3 : seulement ceux liés à pression/fatigue déjà actifs
Décision validée (3 questions de clarification) : seuls `clutchKiller`,
`bigGameChoker`, `playoffPerformer`, `metronome`, `erratic` et `warrior` sont
implémentés cette session — tous branchés sur des mécaniques déjà actives
(pression, fatigue, blessure). `mentor`/`vestiaireToxique` restent hors scope
par construction de la spec (P3/P4). `lateBloomer` (nécessite un suivi des
mois de saison, absent du modèle de calendrier actuel) et `mentallyFragile`
(nécessite de calculer pour la première fois `state.form`, un rolling de
performance post-match jamais implémenté) sont reportés à une session
ultérieure, en même temps que l'infrastructure dont ils dépendent — éviter de
fragmenter cette construction en deux passes.
→ `engine/config/tuning.ts` (`pressureModifier`), `engine/simulation/mental.ts`

### Variance de performance (métronome/erratique) : un facteur de bruit par match, pas par tir
Décision validée : un facteur multiplicatif est tiré une fois par joueur au
début du match (`computeVarianceFactor`, `rng.gaussian(1, stdDev)`, borné
[0.7, 1.3]) et appliqué aux `skills` de `OnCourtPlayer.effective` (le
physique ne varie pas d'un match à l'autre). Neutre (facteur = 1, aucun tirage
rng) pour tout joueur sans l'un des deux traits — ce sont des perks
conditionnels, pas un bruit universel appliqué à tous les joueurs de la ligue
(qui aurait exigé une recalibration substantielle des cibles déjà calées en
Session D). Les entrants en cours de match (rotation.ts) réutilisent le même
facteur via `GameState.variance`, pour rester cohérents avec le 5 de départ.
→ `engine/simulation/mental.ts` (`computeVarianceFactor`, `applyVarianceToSkills`), `engine/simulation/game.ts`, `engine/simulation/rotation.ts`

### `discipline` remplace la constante figée de la cause OFFENSIVE_FOUL du turnover (TODO P1 résolu)
Documenté depuis P1 (`docs/decisions.md` "Cause OFFENSIVE_FOUL... P2 only") :
`ACTION_MODIFIERS.turnoverOffensiveFoulBaseWeight` était une constante fixe en
P1/Session 1-2, faute de bloc mental actif. Remplacée par
`disciplineOffensiveFoulWeight(discipline)` (mental.ts) : une discipline élevée
réduit le poids (moins de fautes offensives), une discipline faible l'augmente,
plancher à 1 (jamais nul).
→ `engine/simulation/mental.ts` (`disciplineOffensiveFoulWeight`), `engine/simulation/possession.ts` (`resolveTurnover`)

### Trait Guerrier : atténuation de fatigue + retour de blessure accéléré, tous deux bornés
Guerrier atténue la pénalité de `gameStaminaFactor` en la rapprochant de 1
(blend, jamais de dépassement de 1) et réduit la durée d'indisponibilité après
blessure (`× MENTAL.warriorInjuryRecoveryMultiplier`, plancher à 1 match — un
Guerrier ne revient jamais instantanément).
→ `engine/simulation/mental.ts` (`effectiveGameStaminaFactor`, `effectiveInjuryGamesOut`), `engine/season/season.ts`

### Calibration : aucun ajustement nécessaire, confirmé par comparaison à seed identique
Un premier batch de contrôle (10 saisons, nouvelle seed `fblm-session3-control`)
montrait une part de tirs à 3pts à 34.1 % (hors cible [38-42%], vs 41.3 % OK en
Session 2) et un meilleur scoreur à 23.9 pts (vs 25.9 en Session 2) — écarts qui
auraient pu suggérer une régression du système de pression. Un second batch
avec la **même seed que la Session 2** (`fblm-session2-control`) a produit des
résultats quasi identiques à la Session 2 (3PA 41.3 % OK, meilleur scoreur
25.8, victoires à domicile 54.3 % — tous les écarts déjà documentés restent de
même ampleur) : le premier batch reflétait donc du bruit d'échantillonnage
inter-seed (10 saisons est un petit échantillon), pas une régression du moteur.
Confirmé : le tirage `rng.gaussian` supplémentaire par joueur/match (variance
de performance) déplace le flux de tirages aléatoires en aval même pour les
joueurs neutres, ce qui explique la sensibilité à la seed sans indiquer de
biais systématique — `PRESSURE`/`MENTAL` restent aux valeurs initiales.
→ `engine/config/tuning.ts` (`PRESSURE`, `MENTAL`)

## Phase 2 — Mode match live (Session 4)

### API du mode live : objet de session explicite plutôt qu'un générateur
Décision produit validée : `LiveGameSession` (liveGame.ts) enveloppe un
`GameEngine` (gameEngine.ts) et expose `.step()` (avance une possession, renvoie
un instantané sérialisable), plus des méthodes d'intervention
(`.callTimeout()`, `.substitute()`, `.setTactics()`) appelables entre deux
`.step()`. Alternative écartée : une fonction génératrice (`function*`) —
idiomatique mais plus délicate à sérialiser/persister à travers une future
frontière UI ou client-serveur (techno UI non choisie, CLAUDE.md).
→ `engine/simulation/liveGame.ts`

### Extraction de `GameEngine` : mécanique, pour préserver le hash golden master
`game.ts` (Sessions 1-3) contenait toute la boucle de match en un seul bloc.
Extraite telle quelle dans `gameEngine.ts` (`createGameEngine`), qui expose
`stepPossession()`/`finalize()` — `simulateGame` (game.ts) n'est plus qu'une
boucle `while (!engine.stepPossession()) {}` autour de ce moteur partagé avec
le mode live. Extraction strictement mécanique (aucun nouvel appel RNG, même
ordre d'exécution) : un test de propriété (`tests/properties/liveGame.property.test.ts`,
60 seeds) vérifie que `LiveGameSession` sans intervention produit un log
strictement identique à `simulateGame` — le hash golden master n'a donc changé
qu'à cause du calendrier à jours réels (entrée suivante), pas de ce refactor.
→ `engine/simulation/gameEngine.ts`, `engine/simulation/game.ts`

### Calendrier à jours réels : remplace le proxy stochastique de back-to-back de la Session 2
Décision produit validée (question de clarification). `schedule.ts` assigne
maintenant une vraie date ISO à chaque match (`assignDates`, algorithme
glouton : un quota de matchs/jour dérivé de `SCHEDULE.seasonLengthDays` limite
le nombre de matchs programmés par soir — sans ce plafond, l'algorithme
programme jusqu'à 15 matchs/soir, épuisant toutes les équipes reposées en un
jour et forçant un back-to-back systématique le lendemain ; deux passes par
jour préfèrent les équipes reposées, une seconde passe n'autorise un
back-to-back que pour compléter le quota si le pool reposé est insuffisant).
`season.ts` détecte maintenant un vrai back-to-back (jour consécutif) au lieu
du tirage `rng.bool(FATIGUE.backToBackRate)` de la Session 2. Le play-in et
les playoffs ne reçoivent volontairement pas de date (`gameDate` absent) : une
vraie planification de séries n'a jamais de back-to-back (repos ≥ 1 jour entre
deux matchs), donc `isBackToBack` y reste toujours faux plutôt que de
construire un calendrier de playoffs synthétique hors scope.
→ `engine/season/schedule.ts` (`assignDates`), `engine/season/season.ts` (`playRealGame`), `engine/config/tuning.ts` (`SCHEDULE`)

### Calibration du calendrier : taux de back-to-back émergent (~26 %), pas forcé à 16 %
`SCHEDULE.seasonLengthDays` pilote indirectement le nombre de matchs/jour
programmés, donc le taux de back-to-back qui en émerge — relation non linéaire
et par paliers entiers (le nombre de matchs/jour est arrondi), pas un curseur
continu. Essais : 174 jours → 5 % de back-to-back, 160 jours → 25.9 %, 140
jours → 50 %. Retenu **160 jours** (25.9 %, calendrier du 21 oct. à fin mars) :
plus proche de la réalité NBA récente (~24-30 % de matchs en back-to-back par
équipe et par saison) que le proxy arbitraire de la Session 2 (16 %) ou que le
palier plus bas (5 %, trop peu réaliste). Batch de contrôle (10 saisons, seed
`fblm-session2-control`) : aucune régression malgré le taux de back-to-back
plus élevé qu'avant — victoires à domicile même légèrement rentrée dans la
cible (55.2 % contre 54.3 % hors cible en Session 3), tous les autres écarts
déjà documentés inchangés en ampleur (3P%, meilleur scoreur, corrélation
talent→wins).
→ `engine/config/tuning.ts` (`SCHEDULE.seasonLengthDays`)

### Temps-mort : effet volontairement simple, pas de mécanique momentum/adversaire
Décision produit validée : `callTimeout` (gameEngine.ts) ne fait que restaurer
un peu de `gameStamina` aux 5 joueurs sur le terrain et consommer un des
`TIMEOUT.perTeamPerGame` temps-morts disponibles — la fenêtre d'intervention
libre (substitution/tactique) est déjà permise à tout moment via les autres
méthodes de `GameEngine`, le temps-mort n'a donc pas besoin de la "débloquer"
mécaniquement. Pas d'effet "adversaire refroidi"/momentum : hors scope
(mental/momentum plus poussé, P3+), écarté explicitement lors du cadrage de
session.
→ `engine/config/tuning.ts` (`TIMEOUT`), `engine/simulation/gameEngine.ts` (`callTimeout`)

### Substitution manuelle : bypass du moteur automatique, pas d'intégration à la hiérarchie de rotation
`substitute()` (gameEngine.ts) échange directement deux `OnCourtPlayer` et émet
un événement `SUB`, sans mettre à jour `RotationPlan`/`targetMinutes` — une
substitution manuelle du GM est une dérogation ponctuelle au plan automatique
de la Session 1, pas un nouveau plan permanent. Le moteur de rotation
automatique (`decideSubstitutions`) continue de fonctionner normalement après
coup, en lisant l'état `onCourt` à jour.
→ `engine/simulation/gameEngine.ts` (`substitute`)

### Démo CLI scriptée plutôt qu'une UI interactive
Décision produit validée : `batch/live-demo.ts` avance un match via
`LiveGameSession`, imprime un flux texte (score, tirs, pertes de balle,
blessures, changements, temps-morts) et applique une séquence scriptée
d'interventions (temps-mort en Q2, substitution manuelle en Q3, changement
tactique en Q4) — reste un outil de validation batch (CLAUDE.md : "le harnais
batch est un produit"), pas un produit UI ; la technologie d'UI n'est pas
encore choisie (CLAUDE.md : "UI décidée plus tard, découplée du moteur").
REBOUND et FREE_THROW individuels ne sont volontairement pas rendus ligne par
ligne (bruit élevé pour un flux minimal) — ils restent dans le log/box score.
→ `batch/live-demo.ts`
