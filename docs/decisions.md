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
