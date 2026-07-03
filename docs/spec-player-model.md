# Spec — Modèle `Player` (FBLM)

> Statut : v1 — définie en amont de la phase 1.
> Le schéma complet existe dès la phase 1, mais chaque bloc n'est **activé** par le moteur qu'à partir de sa phase (colonne "Actif dès").

---

## 1. Identité

| Champ | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `firstName` / `lastName` | string | Générés procéduralement (pools de noms fictifs FBL) |
| `birthDate` | date | Âge dérivé, jamais stocké |
| `heightCm` | int | 175-225 |
| `weightKg` | int | Cohérent avec la taille (IMC plausible) |
| `wingspanCm` | int | Taille ±0 à +15 cm ; influence contre/interception/rebond |
| `position` | enum | PG, SG, SF, PF, C |
| `secondaryPositions` | enum[] | 0 à 2 |
| `handedness` | enum | droitier / gaucher (~10 %) |
| `jerseyNumber` | int | 0-99, unique par équipe |
| `origin` | string | Ville/région réelle (narration draft) — voir CLAUDE.md "Exception villes" |

## 2. Physique — `physical` (0-99, actif dès P1)

`speed`, `vertical`, `strength`, `lateralQuickness`, `stamina`

## 3. Technique — `skills` (0-99, actif dès P1)

**Attaque** : `finishing` (près du cercle), `midRange`, `threePoint`, `freeThrow`, `ballHandling`, `passing`, `courtVision`, `postPlay`
**Défense** : `onBallDefense`, `offBallDefense`, `block`, `steal`, `offRebound`, `defRebound`, `defensiveIQ`

## 4. Mental — `mental` (actif dès P2)

### 4.1 Attributs numériques (0-99)

| Attribut | Effet principal |
|---|---|
| `leadership` | Amortit le malus de pression des coéquipiers, limite les chutes de moral collectives |
| `composure` | Résistance individuelle à la pression (voir §7) |
| `competitiveness` | Bonus d'intensité dans les matchs à enjeu, malus de motivation dans les matchs sans enjeu |
| `discipline` | Réduit fautes et turnovers, respect des consignes tactiques |
| `coachability` | Multiplicateur d'efficacité du staff sur la progression (P3) |
| `workEthic` | Multiplicateur de progression annuelle et de maintien en fin de carrière (P3) |
| `ego` | Exigences de rôle/ballon ; conflits de vestiaire si non satisfait (P4+) |

### 4.2 Traits discrets (0 à 3 par joueur, style perks)

| Trait | Effet (modificateur conditionnel) |
|---|---|
| **Tueur du money time** | +X % attributs offensifs si pression ≥ élevée |
| **Peur des grands matchs** | -X % tous attributs si pression ≥ élevée (peut être caché, voir §5) |
| **Joueur de playoffs** | Bonus global en playoffs, léger malus de motivation en saison régulière |
| **Mentor** | Boost la progression des jeunes du roster (P3) |
| **Vestiaire toxique** | Dégrade le moral d'équipe si son ego n'est pas satisfait (P4) |
| **Fond de forme tardif** | Montée en puissance sur les mois 4-6 de la saison |
| **Métronome** | Variance de performance réduite (peu de très bons/mauvais matchs) |
| **Irrégulier** | Variance de performance élevée |
| **Guerrier** | Revient plus vite de blessure, joue légèrement mieux fatigué |
| **Fragile mentalement** | Malus prolongé après une grosse contre-performance |

Règles : traits mutuellement exclusifs par paires évidentes (Tueur/Peur, Métronome/Irrégulier). Implémentés comme des **modificateurs conditionnels** branchés sur le contexte de match — jamais de logique spéciale dispersée dans le moteur.

## 5. Attributs cachés — `hidden` (jamais affichés bruts)

| Champ | Actif dès | Notes |
|---|---|---|
| `potential` | P3 | Plafond de progression global |
| `growthCurve` | P3 | Profil de courbe : précoce / standard / tardif |
| `injuryProneness` | P2 | Probabilité de blessure |
| `trueComposure` | P2 | Le *vrai* clutch. `composure` affiché = réputation ; l'écart entre les deux crée les paris de scouting et de draft |
| `peakAge` / `declineRate` | P3 | Sommet de carrière et vitesse de déclin |

Le scouting (P3) ne renvoie que des **fourchettes** sur ces valeurs, dont la précision dépend de l'investissement scouting. Le trait « Peur des grands matchs » peut être caché tant que le joueur n'a pas disputé de match à forte pression observé.

## 6. État dynamique — `state` (recalculé, non généré)

`morale`, `fitness` (fatigue long terme), `gameStamina` (intra-match), `injury` (type, durée restante), `form` (rolling des 10 derniers matchs)

## 7. Système de pression (moteur, P2)

À chaque possession, le moteur calcule `pressureScore` (0-100) à partir du contexte :

```
pressureScore = base(typeMatch)            // saison basse enjeu < course playoffs < play-in < playoffs < game 7 < Finales FBL
              + clutchTime                 // écart ≤ 5 pts ET ≤ 5 min au Q4/OT
              + eliminationStake           // défaite = élimination
              + rivalité / affluence hostile (extérieur)
```

Puis pour chaque joueur :

```
effectiveAttr = baseAttr × pressureModifier(trueComposure, traits, pressureScore)
                        × teamLeadershipBuffer   // meilleur leadership du 5 sur le terrain, ne s'applique qu'aux coéquipiers
```

- `composure`/`trueComposure` élevé : attributs maintenus, légèrement boostés au-delà de 90
- Faible : malus progressif pouvant atteindre -15 à -20 % au pic de pression
- Le leadership n'agit **jamais** sur soi-même, uniquement en tampon pour les autres

## 8. Archétypes et fourchettes de génération

Chaque joueur est généré depuis un archétype (fourchettes indicatives ; tout est centralisé dans `tuning.ts`). Un tirage "hors-archétype" (~10 %) crée des profils atypiques.

| Archétype | Positions | Points forts (75-95) | Moyens (55-75) | Faibles (25-55) |
|---|---|---|---|---|
| **Meneur gestionnaire** | PG | passing, courtVision, ballHandling, discipline | midRange, steal | finishing, postPlay, block |
| **Combo guard scoreur** | PG/SG | finishing, threePoint, ballHandling, speed | midRange | passing, défense, ego souvent haut |
| **3&D** | SG/SF | threePoint, onBall/offBallDefense, discipline | steal, defRebound | ballHandling, passing, création |
| **Ailier tout-terrain** | SF/PF | polyvalence 65-85 partout | — | rarement d'attribut > 88 |
| **Scoreur d'isolation** | SG/SF | finishing, midRange, threePoint, ballHandling | freeThrow | passing, défense, ego haut |
| **Stretch four** | PF | threePoint, midRange, taille | defRebound | speed, postPlay défensif |
| **Protecteur de cercle** | C | block, defRebound, strength, wingspan haut | finishing (près du cercle) | threePoint, freeThrow, passing |
| **Pivot moderne** | C | finishing, passing (short roll), defRebound | midRange, block | threePoint variable |
| **Poste bas old school** | PF/C | postPlay, strength, offRebound | midRange | speed, threePoint |
| **Pitbull défensif** | PG/SG | onBallDefense, steal, lateralQuickness, competitiveness | stamina | tous attributs offensifs |

Génération : `archétype → fourchettes par attribut → tirage gaussien borné → cohérence physique (taille/poids/envergure par position) → mental et cachés tirés indépendamment de la qualité technique` (un role player peut être un grand leader, une star peut avoir peur des grands matchs — c'est voulu).

## 9. Activation par phase (rappel)

| Phase | Blocs actifs dans la simulation |
|---|---|
| P1 | Identité, physique, technique (version agrégée possible : les 6 macro-attributs dérivés du détail) |
| P2 | + état dynamique, pression/mental en match, injuryProneness |
| P3 | + potentiel, courbes, workEthic/coachability, scouting en fourchettes |
| P4+ | + ego, traits de vestiaire, exigences de rôle |
