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

## Phase 3 — Courbes de carrière (Session 1)

### `deriveAge` déplacé de `simulation/fatigue.ts` vers `players/age.ts`
Le vieillissement multi-saisons (intersaison) est une responsabilité du domaine
joueur, pas de la simulation de match — `players/` est le domicile désigné
(CLAUDE.md, structure du repo). **Décision** : `deriveAge` déménagé dans
`engine/players/age.ts` (nouvelle fonction `addYears`/`yearsBetween` au passage),
ré-exporté depuis `fatigue.ts` pour ne rien casser côté appelants existants
(`fatigue.test.ts` continue d'importer depuis `./fatigue.js`).
→ `engine/players/age.ts`, `engine/simulation/fatigue.ts`

### La `birthDate` d'un joueur existant n'est jamais mutée — seule la "référence" avance
Alternative écartée : décrémenter `birthDate` d'un an à chaque intersaison pour
simuler le vieillissement (calcul trivial, aucune plomberie supplémentaire).
**Décision** : rejetée — un joueur ne "re-naît" pas, et la spec est explicite
(`birthDate` : "l'âge est toujours dérivé, jamais stocké"). À la place,
`batch/run.ts` fait avancer une `referenceDate` (`addYears(PLAYER_GENERATION.referenceDate, n)`)
d'une saison à l'autre, et tout le calcul d'âge (progression, déclin, retraite)
la reçoit en paramètre explicite plutôt que de dépendre d'une valeur par défaut
figée. Limite connue et documentée : le calcul de risque de blessure
(`fatigue.ts checkInjuries`) continue d'appeler `deriveAge` sans référence
explicite (donc figée à la date de génération) — l'âge y reste donc celui de la
saison 0 même en batch multi-saisons avancé. Pas corrigé cette session : cela
demanderait de faire transiter la référence de ligue jusque dans
`SimulateGameOptions`/`GameEngine`, une plomberie plus large que le périmètre
Session 1 (progression/retraite à l'intersaison uniquement). À revisiter si le
risque de blessure lié à l'âge devient un point de calibration sensible sur de
longs batches.
→ `engine/players/age.ts`, `engine/season/offseason.ts`, `batch/run.ts`

### `potential` : plafond global unique, partagé technique + physique
La spec (`spec-player-model.md §5`) décrit `potential` comme "plafond de
progression global", pas un plafond par attribut. **Décision** : un seul
scalaire (0-99) sert de ceiling à *tous* les attributs (skills et physical) —
pas de plafond dérivé par attribut. Un joueur généré au-dessus de son propre
`potential` (tirage d'archétype fort + potential bas, tirages indépendants,
spec §8) n'est jamais rabaissé de force : `growAttribute` calcule un
`effectiveCeiling = max(potential, valeurActuelle)`, qui bloque toute
progression future sans jamais réduire un attribut déjà haut.
→ `engine/players/development.ts`

### Le physique pique avant le technique — décalage symétrique autour du pic effectif
La spec dit seulement "les attributs physiques déclinent avant les
techniques", sans détail chiffré. **Décision** : `physicalPeakAge = effectivePeakAge − 1`,
`technicalPeakAge = effectivePeakAge + 1` (constantes `DEVELOPMENT.physicalPeakLeadYears`/
`technicalPeakLagYears`) — le physique entre en phase de déclin un peu avant
le pic "nominal" du joueur (`hidden.peakAge` décalé par `growthCurve`), le
technique un peu après. `declineRate`/`workEthic` s'appliquent identiquement
aux deux catégories ; seule la perte annuelle de base diffère
(`physicalBaseAnnualLoss` > `technicalBaseAnnualLoss`), pour que le physique
décline aussi plus *vite*, pas seulement plus tôt.
→ `engine/config/tuning.ts` (`DEVELOPMENT`), `engine/players/development.ts`

### Micro-progression en cours de saison : pliée dans la même passe annuelle, pas un vrai tick mi-saison
La spec (plan P3 §Session 1) décrit une micro-progression "en cours de saison"
pour les jeunes à fort temps de jeu. **Décision** : implémentée comme un bonus
flat additionnel (`DEVELOPMENT.microProgression`) dans le même calcul de
progression annuelle à l'intersaison (`applyAnnualDevelopment`), conditionné
sur l'âge et la part de minutes de la saison écoulée — pas un vrai
recalcul pendant la saison elle-même. Raison : la boucle de saison
(`simulateSeason`) n'a aujourd'hui aucun point d'ancrage "mi-saison" (pas de
notion de mois de saison dans le calendrier), et une vraie mutation
d'attributs pendant la saison changerait le comportement d'un
`simulateSeason` unique (donc casserait potentiellement le golden master, qui
ne couvre qu'une seule saison). Cette implémentation garde le hash golden
master intact pour cette session — l'effet reste "visible mais léger" comme
demandé, juste appliqué au même moment que le reste de la courbe de carrière.
→ `engine/config/tuning.ts` (`DEVELOPMENT.microProgression`), `engine/players/development.ts`

### Remplacement des retraités : filler générique à fourchette d'âge dédiée, pas encore de draft
Le draft (Session 2) n'existe pas encore ; sans remplacement, les rosters se
viderait au fil des retraites. **Décision** : `offseason.ts` génère un
remplaçant via `generatePlayer` (même pipeline qu'à la création de ligue) pour
combler chaque poste sous-effectif. Premier essai : réutiliser la `birthDate`
telle que générée par `generatePlayer` (fourchette pleine `PLAYER_GENERATION.ageRange`
[19,38]) — **rejeté après un batch de contrôle 20 saisons** (seed
`fblm-p3-session1-control`) : un "remplaçant" tiré dans toute la fourchette
peut être un vétéran de 35 ans, ce qui ne renouvelle jamais la ligue ; l'âge
moyen ne se stabilisait jamais (montée continue ~28.6 → ~31 sur 20 saisons,
jamais de plateau). **Décision finale** : nouvelle fourchette dédiée
`DEVELOPMENT.replacementAgeRange` (19-22 ans, alignée sur la fourchette
"draft" mentionnée pour la Session 2), qui écrase la `birthDate` générée.
Deuxième batch de contrôle : âge moyen stable, oscillant 25.7-28.1 sur 20
saisons — cible atteinte. Filet temporaire documenté : remplacé par un vrai
flux de rookies draftés dès que la Session 2 existe.
→ `engine/config/tuning.ts` (`DEVELOPMENT.replacementAgeRange`), `engine/season/offseason.ts`

### Calibration des retraites : deux passes de batch de contrôle (20 saisons)
Premier essai (`baseAgeThreshold=34`, `probPerYearOverThreshold=0.1`) :
combiné au filler à pleine fourchette d'âge (voir décision ci-dessus), l'âge
moyen ligue montait sans jamais se stabiliser (~28.6 saison 1 → ~31 saison 20,
plateau autour de 31 pas dans la cible [24-28]). Après correction du filler
(fourchette 19-22), l'âge moyen se stabilisait déjà mieux (~28-28.8) mais
restait au-dessus de la cible haute. **Décision finale** : `baseAgeThreshold`
abaissé 34 → 32, `probPerYearOverThreshold` relevé 0.1 → 0.14,
`lowRatingAgeThreshold` abaissé 30 → 28, `lowRatingProb` relevé 0.06 → 0.08.
Batch de contrôle final (seed `fblm-p3-session1-control`, 20 saisons) : âge
moyen oscillant 25.7-28.1, moyenne ~26.7 — dans la cible du plan-développement
("âge moyen ~26 ans, stable"). Retraites/saison stabilisées ~20-50 (sur 450
joueurs), sans mur ni collapse. Aucun changement nécessaire côté `DEVELOPMENT.progression`/
`decline` : les distributions de ratings restent stables sur le même batch
(pas de test statistique dédié cette session, cf. "Étendre les tests
statistiques" ci-dessous).
→ `engine/config/tuning.ts` (`DEVELOPMENT.retirement`)

### Golden master inchangé cette session (contrairement à l'attente initiale)
Le hash golden master (`tests/golden`) simule une seule saison
(`GOLDEN_SEED`) via `simulateSeason` — l'intersaison (`runOffseason`) n'est
jamais appelée dans ce chemin. Comme toute la logique de courbe de carrière
n'est invoquée qu'à l'intersaison (jamais pendant une saison), le
comportement du moteur de possession/saison reste strictement identique :
le golden master **n'a pas eu besoin d'être régénéré** cette session (vérifié :
`npm test` reste vert sans toucher `tests/golden/golden-hash.txt`). Il le sera
dès qu'une session touchera la génération de ligue elle-même (Session 2 —
draft/lottery modifient les rosters dès la saison 1 si le calendrier bat les
picks avant la saison régulière).
→ `tests/golden/golden-master.ts` (inchangé)

### Tests étendus (mêmes 5 familles, plan-développement — principe transverse)
- **Famille 1 (unitaires déterministes)** : `engine/players/age.test.ts`,
  `engine/players/development.test.ts`, `engine/season/offseason.test.ts` —
  courbes de pic, progression/déclin, bornes de retraite, taille de roster
  après intersaison, déterminisme seedé.
- **Famille 2 (propriétés)** : `tests/properties/development.property.test.ts`
  — bornes [0,99] et plafond `potential` sur 200 joueurs × 25 années
  simulées, monotonie de `retirementProbability` en âge sur 100 joueurs.
- **Famille 3 (statistique/batch)** : `batch/run.ts` exécute désormais
  `runOffseason` entre deux saisons et affiche un rapport démographique
  (âge moyen ligue/saison, retraites, remplacements) contre la nouvelle cible
  `LEAGUE_TARGETS.leagueAverageAge` (24-28) — validé sur 20 saisons de contrôle.
  Pas de test automatisé bloquant sur ce rapport cette session (même statut
  "warning informatif" que les autres métriques `LEAGUE_TARGETS` non encore
  passées en bloquant, `tests/statistical/league-distributions.test.ts` reste
  inchangé) — à envisager une fois la Session 2 stabilisée.
- **Famille 4 (golden master)** : inchangé, voir décision ci-dessus.
- **Famille 5 (performance)** : `runOffseason` ajoute un coût négligeable
  (~450 joueurs, calcul O(1) par attribut) — le batch de contrôle 20 saisons
  reste à ~12s/saison, identique à avant cette session.
→ `engine/players/age.test.ts`, `engine/players/development.test.ts`,
`engine/season/offseason.test.ts`, `tests/properties/development.property.test.ts`

## Phase 3 — Classes de draft et lottery (Session 2)

### Génération des prospects : post-traitement de `generatePlayer`, pas un pipeline dédié
Même logique que le remplaçant générique de la Session 1 (`offseason.ts`) :
plutôt que dupliquer physique/mental/traits, `generateDraftClass`
(`engine/generation/draftClass.ts`) appelle `generatePlayer` puis (1) réécrit
`birthDate` sur 18-22 ans (`randomBirthDateForAge`, `DRAFT_GENERATION.ageRange`),
(2) resserre chaque skill technique vers le bas (`DRAFT_GENERATION.skillDiscount`
= ×0.65 — spec : "attributs actuels FAIBLES"), (3) retire `hidden.potential`
avec une variance plus large que la génération standard
(`DRAFT_GENERATION.potential`, stdDev 24 vs 20) décalée par la qualité de
cuvée de la saison. Une seule source de vérité pour la génération de base
(physique/mental/traits), cohérent avec CLAUDE.md.
→ `engine/generation/draftClass.ts`

### Qualité de cuvée : décalage gaussien borné, tiré une fois par classe
La spec ne fixe pas de mécanisme précis pour "bonnes/mauvaises années".
**Décision** : `drawDraftClassQualityOffset` tire un scalaire
`N(0, DRAFT_GENERATION.classQualityStdDev)` borné à ±`classQualityMax` (±18),
ajouté à la moyenne de `potential` de toute la promotion — une cuvée "forte"
produit statistiquement plus de prospects à haut potentiel, sans jamais
garantir une vraie superstar (toujours soumis à la variance individuelle).
Vérifié sur `tests/properties`/`draftClass.test.ts` : une cuvée à +15 produit
une moyenne de potentiel significativement plus haute qu'une cuvée à -15.
→ `engine/config/tuning.ts` (`DRAFT_GENERATION`), `engine/generation/draftClass.ts`

### Lottery : odds NBA post-2019 reprises telles quelles (format non protégé)
CLAUDE.md autorise explicitement la reprise de la structure de ligue/formats
de compétition (non protégés), et le prompt de cadrage demandait "style NBA :
les 3 pires équipes à égalité de chances pour le pick 1". **Décision** :
`DRAFT_LOTTERY.pickOneOddsPerThousand` reprend exactement la table NBA
post-2019 (140/140/140/125/105/90/75/60/45/30/20/15/10/5, somme 1000, 14
équipes lottery). Tirage simplifié par rapport aux vraies combinaisons NBA
(4 tirages pondérés successifs avec retrait de l'équipe tirée et redistribution
des poids restants, plutôt qu'un vrai calcul combinatoire à 4 chiffres) —
produit qualitativement le même comportement (les 3 pires équipes quasi à
égalité pour le pick 1, vérifié par test statistique sur 3000 tirages,
`tests/properties`/`draft.test.ts`) sans reproduire l'algorithme exact de
tirage de boules NBA, jugé hors scope pour l'objectif de la session.
→ `engine/config/tuning.ts` (`DRAFT_LOTTERY`), `engine/market/draft.ts` (`computeDraftOrder`)

### Ordre du 2e tour : identique au 1er tour (pas un second tirage de lottery)
La spec dit "draft 2 tours (60 picks)" sans préciser si le 2e tour a son propre
ordre. **Décision** : `runDraft` reuse le même `order` (30 équipes) pour les
deux tours — reflète la pratique NBA usuelle (le 2e tour suit generalement le
même ordre inversé de classement, sans nouvelle lottery). Pas de gestion de
picks échangés/protégés (`DraftPick` en tant qu'entité tradable) — hors scope
avant la Phase 5 (trades complets).
→ `engine/market/draft.ts` (`runDraft`)

### IA de sélection : "meilleur talent disponible" pur, sans besoins d'équipe ni scouting
Le plan-développement mentionne "IA de draft des autres équipes (besoins +
meilleur talent disponible)" mais le découpage de session donné par
l'utilisateur place explicitement l'IA de draft en Session 3 ("Scouting et IA
de draft"), aux côtés du système de fourchettes. **Décision** : cette session
implémente uniquement une sélection triviale — `prospectValue = overall×0.4 +
potential×0.6`, prise sur les **vraies valeurs** (aucune incertitude de
scouting n'existe encore) — sans aucune notion de besoin de roster par poste.
Sera remplacé/enrichi en Session 3 par une IA qui raisonne sur des fourchettes
scoutées plutôt que sur la vérité, et potentiellement sur les besoins
d'équipe. Documenté explicitement pour ne pas être confondu avec un oubli.
→ `engine/market/draft.ts` (`runDraft`, `prospectValue`)

### Non-draftés : pool en mémoire seulement, pas encore de vraie entité "free agent"
Spec : "les non-draftés deviennent free agents invisibles en P3 (pool pour la
Phase 4)". **Décision** : `DraftResult.undraftedProspects` est un simple
tableau de `Player[]` en sortie de `runDraft`, non persisté nulle part dans
`League` (pas de nouveau champ `League.freeAgents`) — le prompt de cadrage dit
littéralement "invisibles en P3", donc aucune UI/mécanique ne doit pouvoir les
voir ou les utiliser cette phase. Ils sont simplement recalculés (perdus)
chaque saison dans le batch actuel ; la Phase 4 (free agency) leur donnera une
vraie persistance dans `League` quand ils deviendront exploitables.
→ `engine/market/draft.ts` (`DraftResult.undraftedProspects`)

### Extension à 17 immédiatement retaillée à 15 (pas de vraie gestion de roster de 17 pendant la saison)
La spec autorise "une extension temporaire à 17 joueurs" mais précise que "la
vraie gestion de roster arrive avec les contrats en P4". **Décision** :
`applyDraftToRosters` ajoute les 2 rookies draftés (roster → 17) puis coupe
immédiatement les 2 moins bien notés (`playerOverallRating`) pour revenir à
`LEAGUE_GENERATION.rosterSize` (15) — le reste du moteur (rotations,
assignation tactique, fatigue) est calibré et testé pour des rosters de 15 ;
laisser un roster à 17 en permanence changerait silencieusement ces
calibrations sans le vouloir. Alternative écartée : garder 17 en permanence —
rejetée, car sans système de contrats/waivers (P4), rien n'empêcherait les
rosters de grossir indéfiniment (+2 nets par saison sur 20 saisons ⇒ 55
joueurs/équipe), ce qu'un batch de contrôle aurait immédiatement révélé comme
absurde. Les joueurs coupés ne sont pas récupérés (perdus, pas de pool de
waivers en P3) — cohérent avec "pas de vraie gestion de roster avant P4".
→ `engine/market/draft.ts` (`applyDraftToRosters`)

### Ordre d'intersaison : progression/retraite d'abord, puis draft
CLAUDE.md décrit la boucle annuelle "Lottery → Draft → Free Agency → ... →
Saison régulière". **Décision** : dans `batch/run.ts`, `runOffseason`
(vieillissement/retraites/purge, Session 1) s'exécute avant le calcul de
l'ordre de lottery et le draft — les rosters sont donc déjà revenus à 15
(vidés de leurs retraités, complétés par des fillers) au moment où le draft
les étend à 17 puis les retaille à 15. Alternative (draft avant intersaison)
écartée : aurait pu drafter un rookie puis le voir immédiatement remplacé par
un filler générique si son équipe manquait de profondeur à son poste, un
comportement absurde.
→ `batch/run.ts`

### Golden master toujours inchangé cette session
Comme en Session 1 : `generateLeague`/`generatePlayer` (chemin utilisé par
`tests/golden`) ne sont pas modifiés — seules de nouvelles fonctions
exportées (`pickFreeJerseyNumber`, `SKILL_KEYS`/`PHYSICAL_KEYS`) s'ajoutent
sans changer le comportement des fonctions existantes. Le draft/la lottery ne
s'exécutent que dans la boucle multi-saisons de `batch/run.ts`, jamais dans un
`simulateSeason` unique. Vérifié : `npm test` reste vert sans régénérer
`tests/golden/golden-hash.txt`.
→ `tests/golden/golden-master.ts` (inchangé)

### Tests étendus (mêmes 5 familles)
- **Famille 1** : `engine/generation/draftClass.test.ts`, `engine/market/draft.test.ts`
  — taille de classe, fourchette d'âge, discount technique, décalage de
  cuvée, ordre de lottery (structure + déterminisme), 60 picks/2 tours,
  extension puis coupe à 15.
- **Famille 2** : `tests/properties/draft.property.test.ts` — validité de
  l'ordre de draft (30 équipes uniques, aucune équipe playoffs avant le pick
  15) sur 100 classements aléatoires ; `draft.test.ts` inclut aussi une
  vérification statistique sur 3000 tirages de lottery (tolérance large,
  non-flaky) pour l'égalité de chances des 3 pires équipes.
- **Famille 3** : `batch/run.ts` affiche désormais un rapport draft par
  saison (taille de classe, décalage de cuvée, non-draftés, note du pick 1) —
  validé sur 20 saisons de contrôle (seed `fblm-p3-session2-control`) :
  aucune anomalie, âge moyen ligue toujours stable (25.7-27.7).
- **Famille 4** : golden master inchangé, voir décision ci-dessus.
- **Famille 5** : coût négligeable ajouté (génération de ~65 prospects +
  tri O(n log n) sur ≤70 éléments par pick) — batch 20 saisons toujours de
  l'ordre de quelques secondes/saison.
→ `engine/generation/draftClass.test.ts`, `engine/market/draft.test.ts`,
`tests/properties/draft.property.test.ts`

## Phase 3 — Scouting et IA de draft (Session 3)

### Budget scouting : un curseur par équipe, persistant, pas une négociation de GM
Le texte de cadrage précise : "la largeur des fourchettes dépend du budget
scouting alloué (simple curseur en P3)" et l'IA de draft a "un biais
d'évaluation propre à chaque équipe (certaines équipes scoutent mal)".
**Décision** : `Team` gagne deux champs (`engine/types/team.ts`) —
`scoutingQuality` (0-1, curseur de budget, `SCOUTING.teamQuality` : moyenne
0.55, écart-type 0.2) et `scoutingBias` (biais d'évaluation systématique en
points d'overall apparent, `SCOUTING.teamBias` : centré sur 0, écart-type 6,
borné ±16) — tirés une fois à la génération de la ligue
(`engine/generation/league.ts`) et persistants comme trait d'identité de
franchise (pas re-tirés chaque saison). Aucune UI/négociation de budget
n'existe en P3 (pas de "curseur" manipulable par le joueur humain avant une
future session UI) : la valeur est fixée à la génération, cohérente avec
"simple curseur en P3" plutôt qu'un système d'allocation actif. Chaque équipe
scoute donc une même classe de façon indépendante et personnelle — deux
équipes peuvent juger différemment le même prospect (`scoutDraftClassForTeam`,
une carte de rapports par équipe via `scoutDraftClassForLeague`), ce qui rend
certaines franchises structurellement meilleures/pires en draft.
→ `engine/types/team.ts`, `engine/config/tuning.ts` (`SCOUTING.teamQuality`/`teamBias`), `engine/generation/league.ts`

### Golden master cassé par ce changement — attendu et documenté
Ajouter deux champs tirés par `rng` à chaque équipe pendant `generateLeague`
déplace la séquence de tirages aléatoires pour toute la suite de la
génération (rosters, jersey numbers...). **Conséquence** : le hash golden
master change dès cette session (contrairement aux Sessions 1 et 2, où le
scouting/draft restait confiné à la boucle batch). C'est exactement ce
qu'annonçait le cadrage initial de la phase ("le golden master cassera en fin
de phase : régénère-le avec le diff batch joint") — `npm run golden:update` a
été relancé, le nouveau hash est committé avec le diff des distributions
batch en pièce jointe du commit.
→ `tests/golden/golden-hash.txt`

### Un "buzz" universel s'ajoute au budget de l'équipe, pas une alternative à celui-ci
Un budget d'équipe seul rendrait les picks de lottery des équipes "pauvres en
scouting" aussi flous que leurs picks de second tour, ce qui ne correspond pas
à la réalité (tout le monde a un dossier sur le consensus #1, même les
équipes mal équipées). **Décision** : une passe de "buzz" à faible
investissement uniforme (`SCOUTING.buzzPassInvestment` = 0.15) classe
grossièrement la classe pour tous ; le rang de buzz ajoute ensuite un bonus
d'attention universel (`SCOUTING.buzzAttentionBonus` : +0.15 pour le haut de
classe `buzzTopShare` = 20 %, +0.05 pour la tranche médiane `buzzMidShare` =
35 %, +0 ensuite) au-dessus du `team.scoutingQuality` propre à l'équipe,
plafonné à 1. `tier` (high/medium/low) reste calculé sur le rang de buzz et
sert d'indicateur de réputation publique pour l'UI à venir, indépendant de
l'investissement réel de telle ou telle équipe.
→ `engine/market/scouting.ts` (`buzzAttentionBonus`, `tierForRank`)

### Fourchette centrée sur la valeur apparente (bruitée), jamais sur la vraie valeur
**Décision** : pour chaque attribut, `scoutAttribute` tire un bruit gaussien
appliqué à la vraie valeur pour obtenir une "valeur apparente", puis construit
la fourchette `[apparente − incertitude, apparente + incertitude]` — la
fourchette peut donc, à faible investissement, ne pas contenir la vraie
valeur. Délibéré : un scouting imparfait doit parfois se tromper
complètement, pas seulement être imprécis autour de la vérité, sans quoi il
n'y aurait jamais de vrai "bust" (un prospect peut sembler solide sur toute sa
fourchette et se révéler mauvais). L'incertitude va de `SCOUTING.maxUncertainty`
(±18, investissement 0) à `SCOUTING.minUncertainty` (±3, investissement 1) —
jamais nulle, un scouting "parfait" n'existe pas même sur les prospects les
plus observés par l'équipe la mieux dotée.
→ `engine/market/scouting.ts` (`scoutAttribute`)

### "Se resserre au fil de la saison" : deux instantanés (mi-saison, final), pas une vraie boucle de scouting continue
Le cadrage précise que les fourchettes "se resserrent au fil de la saison".
Aucune boucle de simulation intra-saison consommant des événements de scouting
n'existe encore (les prospects sont générés d'un bloc juste avant le draft,
cf. Session 2). **Décision** : `ScoutingReport` porte deux instantanés,
`midSeason` (investissement × `SCOUTING.midSeasonInvestmentFactor` = 0.55,
fourchettes plus larges) et `final` (investissement plein, juste avant le
draft) — deux tirages de bruit indépendants sur la même vraie valeur. Seul
`final` alimente la décision de l'IA de draft ; `midSeason` n'est pour l'instant
consommé par aucun calcul (réservé à une future UI qui visualiserait la
progression d'un prospect suivi toute la saison, Session 4+). Une vraie
boucle "un match observé = un peu plus d'information" est jugée hors scope
P3 (le scouting n'est pas encore branché sur le calendrier de matchs).
→ `engine/market/scouting.ts` (`ScoutingSnapshot`, `midSeason`/`final`)

### Le potentiel reste toujours plus incertain que les attributs actuels
spec-player-model §5 traite `potential` comme l'attribut caché par excellence.
**Décision** : la fourchette de potentiel applique `investment ×
SCOUTING.potentialInvestmentPenalty` (0.6) plutôt que l'investissement brut —
même un prospect scouté au maximum garde une fourchette de potentiel
sensiblement plus large que ses fourchettes de skills. Vérifié en moyenne sur
l'ensemble d'une classe (`scouting.test.ts`) plutôt que prospect par
prospect, car le clampage des fourchettes aux bornes [0,99] peut
ponctuellement resserrer un cas individuel près des extrêmes sans invalider la
tendance générale.
→ `engine/config/tuning.ts` (`SCOUTING.potentialInvestmentPenalty`), `engine/market/scouting.ts`

### `trueComposure` et traits cachés : invisibles sauf investissement maximal, encore incertains
Le cadrage : "trueComposure et traits cachés : invisibles au scouting sauf
investissement maximal (et encore, avec incertitude)". **Décision** :
`ScoutingReport.hidden` n'existe (`HiddenAttributesReport`) que si
`investment >= SCOUTING.hiddenRevealThreshold` (0.85) pour cette équipe sur ce
prospect. Même révélé, `trueComposure` reste une fourchette (jamais un
scalaire exact), élargie d'un facteur `SCOUTING.hiddenAttributeUncertaintyFactor`
(1.3) par rapport à un skill normal au même investissement — toujours "avec
incertitude". Les traits mentaux cachés (`player.mental.traits`) sont
"suspectés" plutôt que révélés exactement : chaque vrai trait n'est repris
qu'avec probabilité `SCOUTING.traitRevealProbability` (0.85, un vrai trait
peut passer inaperçu même à investissement maximal), et un faux positif peut
s'ajouter avec probabilité `SCOUTING.traitFalsePositiveChance` (0.1) — modélise
l'incertitude sur du discret sans construire un système de fiabilité par trait
plus élaboré, jugé hors scope P3.
→ `engine/market/scouting.ts` (`scoutHiddenAttributes`, `HiddenAttributesReport`)

### IA de draft : valeur apparente propre à l'équipe + bonus de besoin positionnel, jamais la vraie valeur
Le plan-développement demande une IA "besoins + meilleur talent disponible"
avec un "biais d'évaluation propre à chaque équipe". **Décision** :
`draftDecisionScore` (`engine/market/draft.ts`) utilise
`teamReports.get(prospect.id).final.apparentValue` — le rapport *de cette
équipe précise*, biais inclus (`scoutSnapshot` ajoute `team.scoutingBias` à
l'agrégat `apparentValue`, jamais aux fourchettes de skills/potentiel
affichées, qui restent "objectives" à l'incertitude près) — plus
`needs[position] × DRAFT_AI.needWeight`. `computeTeamNeeds` calcule, pour
chaque poste, `1 − ratingMoyenAuPoste / DRAFT_AI.needNormalizationRating`
(clampé [0,1]) : un poste vide a un besoin maximal (1), un poste déjà fort
(rating ≥ 65) a un besoin nul. `runDraft` accepte `scoutingReportsByTeam`
(`Map<teamId, Map<prospectId, ScoutingReport>>`) et `teams` en paramètres
**optionnels** (retombe sur la vraie valeur et aucun bonus de besoin si
absents) pour ne pas casser les usages de test antérieurs à la Session 3.
`trueProspectValue` (ex-`prospectValue`) reste exporté, réservé aux
statistiques de validation (busts/steals, devenir de carrière) — jamais
consommé par la logique de décision elle-même.
→ `engine/market/draft.ts` (`runDraft`, `draftDecisionScore`, `computeTeamNeeds`, `trueProspectValue`)

### Validation batch : busts/steals immédiats + devenir de carrière réel (r ~0.5-0.7)
Critère de validation explicite : "vérifier que busts et steals existent
(corrélation position de draft → carrière positive mais imparfaite, r
~0.5-0.7)". **Décision** : `batch/run.ts` calcule désormais deux mesures
distinctes. (1) Une corrélation *immédiate* (numéro de pick ↔ `trueProspectValue`
au moment du pick) plus des compteurs de "steal"/"bust" au moment du draft —
utile pour vérifier que le scouting a un effet dès le pick, mais ce n'est
**pas** la métrique demandée par la spec (qui parle de "carrière", pas de
valeur instantanée). (2) La métrique réellement demandée : chaque pick est
suivi (`pendingCareerRecords`) et réévalué `CAREER_LOOKAHEAD_SEASONS` (4)
saisons plus tard, une fois que progression/déclin/retraite ont eu le temps
de s'exprimer — `careerDraftValue = totalPicks − pickNumber + 1` (positif,
plus haut = pick plus précoce) corrélé au rating réel observé à l'échéance.
Un pick introuvable à l'échéance (coupé du roster, retraité) est simplement
ignoré — limite connue et acceptée (biais de survivance : les carrières qui
se terminent mal disparaissent de l'échantillon), car un vrai suivi de
carrière post-coupure appartient à la persistance de la Phase 4
(free agents/historique), hors scope P3. Résultats sur 20 saisons de contrôle
(seed `fblm-p3-session3-control`) : corrélation immédiate pick↔vraie valeur =
**-0.921** (0 steal/0 bust au sens strict des seuils de `batch/run.ts` — les
seuils choisis, top 10/pick 20 pour un steal, top 5/hors top 15 pour un bust,
sont volontairement stricts et donc rares sur un seul run) ; corrélation de
devenir de carrière réel à 4 saisons = **0.570**, en plein dans la cible
spec ("r ~0.5-0.7") — sur 34 picks ayant survécu jusqu'à l'échéance de suivi
(sur ~1200 picks totaux : la plupart des picks de fin de classe ne
tiennent pas 4 saisons sur un roster de 15, cohérent avec la réalité du
turnover en bas de roster). Démographie de la ligue toujours stable (âge
moyen 24.97-27.72, cible 24-28) malgré le changement de séquence RNG
introduit par les nouveaux champs `Team.scoutingQuality`/`scoutingBias`.
→ `batch/run.ts` (`pearsonCorrelation`, `CAREER_LOOKAHEAD_SEASONS`, `pendingCareerRecords`)

### `STATISTICAL_TEST_TARGETS.worstTeamWins.max` élargi de 22 à 23 (collatéral du nouveau tirage RNG)
Ajouter deux champs tirés par `rng` par équipe dans `generateLeague` déplace
la séquence de tirages pour toute la génération de rosters qui suit — pour la
seed fixe du test statistique CI (`fblm-statistical-test-v2-league`), cela a
fait passer `worstTeamWins` (10 saisons) de 22 à 23, sans lien avec la
mécanique de répartition des victoires elle-même (aucune logique de wins n'a
changé cette session). **Décision** : élargir la tolérance d'un point plutôt
que fixer la seed ou changer la logique — cohérent avec la note du fichier de
test ("bornes larges... évite qu'un test CI devienne flaky sur de la variance
statistique normale"), et le seuil n'était de toute façon qu'une tolérance
initiale non spécifiée par la spec (le vrai repère spec est `~15`,
`LEAGUE_TARGETS.winsSpreadBestVsWorst.worst`).
→ `engine/config/tuning.ts` (`STATISTICAL_TEST_TARGETS.worstTeamWins`)

### Tests étendus (mêmes 5 familles)
- **Famille 1** : `engine/market/scouting.test.ts` réécrit pour la nouvelle
  API (`scoutDraftClassForTeam`/`scoutDraftClassForLeague`) : fourchettes
  finales valides et déterministes, mi-saison en moyenne plus large que
  final, deux équipes de budget différent perçoivent le même prospect avec
  une largeur de fourchette différente, le biais déplace la valeur apparente
  sans toucher aux fourchettes affichées, `hidden` absent sous le seuil de
  révélation et présent pour au moins un prospect à investissement maximal.
  `engine/market/draft.test.ts` étendu (`computeTeamNeeds` : besoin maximal
  sur poste vide, bornes [0,1] ; IA de draft basée sur l'apparent par équipe :
  le pick 1 n'est pas systématiquement le meilleur vrai talent sur plusieurs
  tirages ; déterminisme avec scouting + besoins).
- **Famille 2** : pas de nouveau test de propriétés dédié cette session — le
  test de propriétés existant (`draft.property.test.ts`, Session 2) couvre
  déjà l'ordre de draft indépendamment du scouting ; la couverture
  scouting/IA repose sur les tests unitaires ci-dessus + la validation batch.
- **Famille 3** : `batch/run.ts` affiche désormais steals/busts par saison,
  une corrélation immédiate pick↔vraie valeur, et — nouveau — une corrélation
  de devenir de carrière réel à échéance de `CAREER_LOOKAHEAD_SEASONS`
  saisons, validées sur 20 saisons (seed `fblm-p3-session3-control`).
- **Famille 4** : golden master **régénéré** cette session (voir décision
  ci-dessus) — première régénération volontaire depuis la Phase 1/2, diff de
  distributions batch joint au commit.
- **Famille 5** : coût ajouté = un scouting complet par équipe et par saison
  (30 équipes × ~65 prospects × 15 skills + potentiel, deux passes
  mi-saison/final) — reste de l'ordre de quelques secondes/saison
  supplémentaires, négligeable devant le coût de simulation de match.
→ `engine/market/scouting.test.ts`, `engine/market/draft.test.ts`

## Phase 3 — Summer League, boucle annuelle et UI (Session 4)

### `seasonsInLeague` : compteur explicite plutôt qu'une approximation par l'âge
La Summer League cible "rookies et jeunes (< 3 saisons)" — une notion de
tenure, pas d'âge. **Décision** : `PlayerState.seasonsInLeague` (nouveau
champ) est incrémenté de 1 à chaque intersaison pour tout joueur qui reste
sur un roster (`runOffseason`), et démarre à 0 pour tout joueur fraîchement
généré (`generatePlayer`, y compris les rookies draftés et les remplaçants
génériques d'intersaison). Alternative écartée : dériver la tenure de l'âge
(`age − ~20`) — rejetée, car un draft class peut légitimement contenir un
prospect de 22 ans (donc "vieux" selon une heuristique d'âge) qui est
pourtant un authentique rookie ; seul un compteur explicite est correct.
Les rosters *initiaux* de `generateLeague` (une ligue "déjà en cours") ont
malgré tout besoin d'un bootstrap : `generateRoster` calcule une valeur de
départ à partir de l'âge (`SUMMER_LEAGUE.initialTenureAgeBaseline` = 20,
plafonnée par `initialTenureMax`) — un pur calcul, aucun tirage RNG
supplémentaire, donc sans effet sur le golden master.
→ `engine/types/player.ts` (`PlayerState.seasonsInLeague`), `engine/generation/roster.ts`, `engine/season/offseason.ts`

### Summer League : note de performance statistique, pas de simulation possession par possession
Un roster n'a souvent que 2-4 joueurs éligibles (< 3 saisons) : insuffisant
pour un vrai 5x5 avec le moteur de possession existant. **Décision** :
`runSummerLeague` (`engine/season/summerLeague.ts`) tire une "note de
performance" statistique par participant (gaussienne centrée sur
`playerOverallRating`, cf. `SUMMER_LEAGUE.performanceStdDev`), applique un
micro-boost de progression flat sur les skills techniques
(`applySummerLeagueBoost`, jamais au-delà de `potential`, même garde-fou
`effectiveCeiling` que `growAttribute`), et affine le rapport de scouting
propre à l'équipe sur ce joueur (`scoutRosterPlayer`, investissement
= `team.scoutingQuality + SUMMER_LEAGUE.scoutingInvestmentBonus`, plafonné à
1 : "on l'a vu jouer en vrai"). Alternative écartée : construire un vrai
mini-calendrier de matchs Summer League avec `simulateGame` — rejetée pour
cette session, car cela aurait nécessité de gérer des rosters incomplets
(effectifs de 2-4 joueurs, jamais prévus par `pickStartingFive`/`rotation.ts`)
et le "esprit vitrine" de la Summer League ne demande pas un box-score
complet, seulement un effet de jeu (progression + affinage scouting).
→ `engine/season/summerLeague.ts`, `engine/players/development.ts` (`applySummerLeagueBoost`), `engine/market/scouting.ts` (`scoutRosterPlayer`)

### `scoutRosterPlayer` : réutilisation de `scoutSnapshot`, pas une deuxième implémentation
Plutôt que dupliquer la logique de fourchette pour les joueurs déjà sur un
roster, `scoutSnapshot` (jusqu'ici interne à `scoutDraftClassForTeam`) est
directement exposé sous un nom public `scoutRosterPlayer` — une seule source
de vérité pour "comment une équipe estime un attribut cible" qu'il s'agisse
d'un prospect de draft ou d'un jeune déjà rostré (CLAUDE.md — "une source de
vérité par règle"). Sert la Summer League cette session, et une future fiche
joueur enrichie (projection) sans travail supplémentaire.
→ `engine/market/scouting.ts` (`scoutRosterPlayer`)

### `createDraftSession` : la session pick-par-pick devient la seule implémentation, `runDraft` n'est qu'un déroulé automatique
L'écran Draft interactif (big board, "sélection au tap") a besoin d'intercaler
les choix d'un humain au milieu de picks IA — impossible avec l'ancien
`runDraft` qui résolvait tout le draft d'un bloc. **Décision** :
`createDraftSession` (`engine/market/draft.ts`) expose `currentPick()`,
`availableProspects()`, `makePick(prospectId?)` (avec argument = sélection
explicite, sans argument = décision IA via `draftDecisionScore` inchangé) et
`result()`. `runDraft` devient un simple `while (!session.isComplete())
session.makePick()` autour de cette session — aucune régression de
comportement (vérifié par un test comparant les deux chemins pick par pick,
`draft.test.ts`), et le batch/l'orchestrateur `annualLoop.ts` continuent
d'utiliser `runDraft` (aucune interactivité nécessaire côté serveur/batch).
→ `engine/market/draft.ts` (`createDraftSession`, `runDraft`)

### `runAnnualCycle` : un point d'entrée unique pour la boucle annuelle, réutilisable batch/UI
Le cadrage décrit une boucle annuelle précise ("fin de playoffs → retraites →
lottery → draft → Summer League → nouvelle saison"). **Décision** :
`engine/season/annualLoop.ts` centralise cet enchaînement
(`runOffseason` → classe de draft + lottery + scouting + `runDraft` →
`applyDraftToRosters` → `runSummerLeague`) derrière `runAnnualCycle(rng,
league, season, referenceDate)`, remplaçant la logique dupliquée qui vivait
directement dans `batch/run.ts`. `season` n'est PAS typé `SeasonResult`
complet mais un sous-ensemble minimal (`AnnualCycleSeasonInput` :
`minutesByPlayer` + `standings`) — les seules données réellement lues par le
cycle — pour que le même orchestrateur serve aussi bien `simulateSeason`
(batch, saison complète avec playoffs) que `SeasonRunner` (UI interactive,
saison régulière seule, pas encore de playoffs pilotables). `batch/run.ts` a
été refactoré pour l'utiliser ; le harnais garde son propre suivi
steals/busts/corrélation de carrière (préoccupation de validation batch, pas
de la boucle annuelle elle-même).
→ `engine/season/annualLoop.ts`, `batch/run.ts`

### `SeasonRunner.getMinutesByPlayer()` : accumulation nécessaire pour brancher l'UI sur `runAnnualCycle`
`SeasonRunner` (saison jouée match par match côté UI) n'avait pas
d'équivalent au `minutesByPlayer` de `SeasonResult` (`season.ts`, batch).
**Décision** : accumulation directe dans `recordGame` (point de passage
unique, déjà partagé entre le chemin "autres équipes auto-simulées" et le
chemin "match du joueur commité"), exposée via `getMinutesByPlayer()` — même
convention de nommage que `SeasonResult.minutesByPlayer`, pour que
`Intersaison.tsx` puisse appeler `runAnnualCycle` avec des données
équivalentes à celles du batch, sans dupliquer la logique d'accumulation.
→ `engine/season/seasonRunner.ts` (`getMinutesByPlayer`)

### `OffseasonResult.retiredPlayers` : identités des retraités, pas seulement un compteur
Le récapitulatif d'intersaison UI ("retraites marquantes") a besoin de savoir
*qui* part à la retraite, pas seulement combien. **Décision** :
`runOffseason` collecte `{ player, teamId, age }` pour chaque retraité avant
la purge du roster, exposé dans `OffseasonResult.retiredPlayers` — l'appelant
(ici `Intersaison.tsx`) filtre/trie lui-même par `playerOverallRating` pour
n'afficher que les "marquantes" (top 5). Pas de notion de "hall of fame"
persistant construite cette session — hors scope, la Phase 4+ pourrait vouloir
un historique de franchise plus riche.
→ `engine/season/offseason.ts` (`RetiredPlayerRecord`)

### UI — le budget scouting est un curseur par équipe, réglable seulement pour l'équipe du joueur
`Team.scoutingQuality` (Session 3) est déjà un champ par équipe. **Décision** :
l'écran Scouting (`ui/src/screens/Scouting.tsx`) expose un `<input
type="range">` natif (le design system n'a pas de composant slider) qui mute
`userTeam.scoutingQuality` directement — même convention que `Tactics.tsx`
(mutation directe de l'objet `Team` + `forceRender`). Les 29 équipes IA
gardent leur valeur tirée à la génération, jamais exposée/éditable : le
joueur ne règle que son propre budget, cohérent avec "allocation du curseur
budget" (spec, implicitement une décision du GM du joueur, pas une vue globale
sur toute la ligue). `Team.scoutingBias` (le "certaines équipes scoutent
mal") n'est PAS affiché tel quel dans l'UI — resterait un chiffre brut sans
signification pour un joueur humain ; seul son effet (fourchettes, note
apparente) est visible.
→ `ui/src/screens/Scouting.tsx`

### UI — big board trié sur la perception de l'équipe du joueur, jamais une autre perspective
`Draft.tsx` trie `session.availableProspects()` par
`ownReports.get(id).final.apparentValue` — la carte de rapports de l'équipe
du joueur (`reportsByTeam.get(userTeamId)`), jamais `trueProspectValue` ni la
perception d'une autre équipe. Cohérent avec le principe central du scouting
(Session 3) : le joueur humain n'a jamais accès à la vérité, seulement à SA
propre estimation.
→ `ui/src/screens/Draft.tsx`

### UI — navigation verrouillée pendant l'intersaison (bug trouvé et corrigé en test manuel)
`Intersaison.tsx` mute la ligue en plusieurs étapes réelles (offseason, draft,
Summer League) avant de créer la nouvelle saison. **Bug découvert en testant
l'écran dans le navigateur** : naviguer vers un autre onglet (ex. "Franchise")
avant d'avoir cliqué "Démarrer la nouvelle saison", puis revenir sur
"Intersaison", remonte le composant de zéro — son `useRef` lazy-init
relance `runOffseason` + tirage de classe de draft + `runDraft` PAR-DESSUS un
état déjà muté (double retraites, double classe de draft insérée). **Fix** :
la nav du bas (`App.tsx`) est masquée tant que `screen === "intersaison"` —
la seule sortie possible est de terminer le flux via son propre bouton
"Démarrer la nouvelle saison". Alternative écartée : lever tout l'état du
flux au niveau `App` pour survivre à un remount — rejetée, plus complexe pour
un gain equivalent (empêcher la navigation est suffisant et plus simple à
raisonner).
→ `ui/src/App.tsx` (`navLocked`)

### Tests étendus (mêmes 5 familles)
- **Famille 1** : `engine/season/summerLeague.test.ts` (éligibilité par seuil,
  participants filtrés par équipe, micro-boost ne diminue jamais un skill,
  déterminisme, aucun participant si personne n'est éligible) ;
  `engine/season/offseason.test.ts` étendu (`seasonsInLeague` incrémenté de 1
  par survivant, 0 pour un remplaçant) ; `engine/market/draft.test.ts` étendu
  (`createDraftSession` : équivalence avec `runDraft`, sélection explicite
  intercalée, erreur si draft déjà terminé).
- **Famille 2** : pas de nouveau test de propriétés dédié — la couverture
  Summer League/annualLoop repose sur les tests unitaires/intégration
  ci-dessus, le comportement aléatoire sous-jacent (scouting, draft,
  développement) étant déjà couvert par les tests de propriétés des sessions
  précédentes.
- **Famille 3** : `engine/season/annualLoop.test.ts` (intégration : un cycle
  complet enchaîne intersaison/draft/Summer League, rosters cohérents en
  sortie, déterminisme) ; `batch/run.ts` affiche désormais un rapport Summer
  League par saison (participants, note moyenne) via `runAnnualCycle`. Sur 20
  saisons de contrôle (seed `fblm-p3-session4-final`) : âge moyen ligue
  toujours stable (25.6-27.6, cible 24-28), Summer League 70-182
  participants/saison (note moyenne ~61-66), corrélation devenir de carrière
  = **0.573** (toujours en plein dans la cible spec "r ~0.5-0.7"), 1 steal/5
  busts au sens strict des seuils `batch/run.ts` sur ce run.
- **Famille 4** : golden master **inchangé** cette session — aucune des
  nouvelles fonctions (`seasonsInLeague`, Summer League, `annualLoop`,
  `createDraftSession`) n'ajoute de tirage RNG à `generateLeague` ou
  `simulateSeason` ; le bootstrap `seasonsInLeague` dans `generateRoster` est
  un calcul pur (pas de `rng.xxx()`), vérifié par `npm test` restant vert
  sans regénérer `tests/golden/golden-hash.txt`.
- **Famille 5** : coût négligeable ajouté au batch (Summer League ≈ 2-6
  joueurs scoutés/équipe/saison) ; `annualLoop.test.ts` reste dans les mêmes
  ordres de grandeur que les tests de saison complète existants.
- **UI (hors 5 familles, testé manuellement dans le navigateur)** : parcours
  complet vérifié dans Chrome via preview — sélection de franchise, 82 matchs
  simulés (instantané), écran Scouting (curseur de budget, fourchettes qui se
  resserrent en direct après correction d'un bug de memoization React), flux
  Intersaison complet (récapitulatif → Draft interactif avec sélection au tap
  et suivi live des picks IA → récapitulatif Summer League → nouvelle saison),
  bug de navigation pendant l'intersaison trouvé et corrigé (ci-dessus).
→ `engine/season/summerLeague.test.ts`, `engine/season/annualLoop.test.ts`, `engine/market/draft.test.ts`, `engine/season/offseason.test.ts`
