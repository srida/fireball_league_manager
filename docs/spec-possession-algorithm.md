# Spec — Algorithme de résolution d'une possession (FBLM)

> Statut : v1 — cœur du moteur phase 1.
> Principe : une possession est une **machine à états** qui produit une séquence d'événements (le play-by-play). Box scores et stats avancées sont dérivés du log d'événements, jamais calculés à part. Toutes les constantes marquées `⚙` vivent dans `tuning.ts`.

---

## 1. Vue d'ensemble d'un match

```
match = suite de possessions alternées
nombre de possessions ≈ pace des deux équipes (⚙ base ~99/équipe en P1)
horloge simulée : chaque possession consomme 4 à 24 s (tirée selon le déroulé)
fin de quart-temps / de match quand l'horloge expire
prolongation(s) de 5 min si égalité
```

Signature de la fonction cœur :

```ts
resolvePossession(state: GameState, rng: RNG): PossessionResult
// PossessionResult = { events: Event[], points: number,
//                      clockUsed: number, nextPossession: TeamId }
```

`GameState` contient : les 5 joueurs de chaque équipe sur le terrain (avec attributs effectifs), le score, l'horloge, le quart-temps, les fautes d'équipe, le contexte (domicile/extérieur).

## 2. Machine à états d'une possession

```
[MISE EN PLACE]
   │
   ▼
[SÉLECTION DU PORTEUR] ──── turnover précoce ──► [FIN : TURNOVER]
   │
   ▼
[CHOIX D'ACTION]
   ├─► TIR ──────────────► [RÉSOLUTION DU TIR]
   ├─► PASSE (nouvelle itération, max ⚙ 4 passes) ─► [SÉLECTION DU PORTEUR]
   ├─► TURNOVER ─────────► [FIN : TURNOVER]
   └─► FAUTE SUBIE ──────► [LANCERS FRANCS] ─► [FIN]
                │
[RÉSOLUTION DU TIR]
   ├─► RÉUSSI ──► [FIN : POINTS] (+ éventuel and-one)
   ├─► CONTRÉ ──► [REBOND]
   └─► RATÉ ────► [REBOND]
                │
[REBOND]
   ├─► DÉFENSIF ─► [FIN : possession adverse]
   └─► OFFENSIF ─► [CHOIX D'ACTION] (putback favorisé, horloge courte)
```

## 3. Étape 1 — Sélection du porteur / créateur de l'action

Chaque joueur du 5 offensif reçoit un poids d'usage :

```
usageWeight(p) = ⚙w1·ballHandling + ⚙w2·courtVision + ⚙w3·moyenne(finishing, midRange, threePoint)
              × positionFactor(p)        // PG > SG > SF > PF > C en P1
              × gameStaminaFactor(p)     // P2
```

Tirage pondéré → porteur. En P1 c'est volontairement simple ; en P2 les consignes tactiques (option n°1, plays) modifient les poids.

## 4. Étape 2 — Choix d'action du porteur

Probabilités de base (⚙, avant modificateurs) :

| Action | Base | Modificateurs principaux |
|---|---|---|
| Tir | 38 % | + si attributs de tir hauts vs son défenseur ; + si horloge < 6 s (forcé à 100 % à 0 s) |
| Passe | 45 % | + courtVision/passing ; - à chaque passe déjà effectuée dans la possession |
| Turnover | 9 % | - ballHandling/discipline ; + pression défensive (steal du défenseur), + pressureScore (P2) |
| Faute subie | 8 % | + finishing/postPlay (attaque du cercle), + agressivité du défenseur |

Le défenseur assigné est déterminé par matching de position (P1 : poste pour poste ; P2 : switchs et prises à deux tactiques).

## 5. Étape 3 — Sélection du type de tir

Si l'action est un tir, le type est tiré selon le profil du tireur :

```
p(3pts)    ∝ ⚙base3 × f(threePoint)          // f convexe : un 90 tire beaucoup plus qu'un 70
p(midRange)∝ ⚙baseMid × f(midRange)
p(rim)     ∝ ⚙baseRim × f(finishing, speed, postPlay)
```

⚙ Les bases sont calibrées pour reproduire une répartition moderne (~40 % de tirs à 3pts au niveau ligue) — c'est un des curseurs principaux du harnais batch.

## 6. Étape 4 — Résolution du tir

### 6.1 Probabilité de réussite

```
pMake = baseFG(shotType)                        // ⚙ rim ~62 %, mid ~42 %, 3pts ~36 %
      × attackFactor   = 1 + ⚙k·(shooterAttr − 75)/100
      × defenseFactor  = 1 − ⚙d·(defAttr − 75)/100     // defAttr = mix onBallDefense, lateralQuickness/strength selon zone
      × contestFactor                                    // tirage : ouvert / contesté / très contesté, pondéré par offBallDefense adverse et passing du passeur
      × fatigueFactor × pressureModifier                 // P2
      × homeFactor    = ⚙ +1.5 % à domicile
pMake borné dans [⚙0.05, ⚙0.85]
```

### 6.2 Événements liés

- **Contre** : avant le tirage du tir, `pBlock = f(block, vertical, wingspan du protecteur de cercle) `, surtout sur les tirs au cercle (⚙ ~8 % rim, ~2 % ailleurs). Contre → rebond.
- **And-one** : si tir réussi, `pAndOne = ⚙2-4 %` selon shotType et strength.
- **Passe décisive** : créditée au dernier passeur si le tir réussi survient ≤ 1 action après sa passe (dérivée du log, conformément au principe événementiel).

### 6.3 Lancers francs

`pMake = freeThrow/100` par lancer, ajusté ⚙ −3 pts de % si `pressureScore` élevé et composure faible (P2). 2 ou 3 LF selon la zone de faute, 1 si and-one.

## 7. Étape 5 — Rebond

Contribution individuelle :

```
reboundWeight(p) = (side == DEF ? defRebound : offRebound)
                 × ⚙g(heightCm, wingspanCm, vertical, strength)
                 × boxOutFactor(defensiveIQ)      // P2
pOffensiveRebound = Σ poids off / (Σ poids off + ⚙B × Σ poids def)
```

⚙B calibré pour ~26-28 % de rebonds offensifs au niveau ligue. Rebond offensif → nouvelle itération de [CHOIX D'ACTION] avec putback favorisé (`p(tir rim)` fortement augmenté) et horloge des 14 s.

## 8. Consommation d'horloge

Chaque étape consomme du temps tiré dans une fourchette ⚙ : mise en place 4-8 s, chaque passe 2-5 s, création du tir 2-6 s. La somme est bornée par les 24 s. Fin de quart-temps : la possession en cours est tronquée (tir forcé ou horloge expirée).

## 9. Log d'événements (source de vérité)

Chaque possession émet des événements typés :

```ts
type Event =
  | { t: "SHOT";    player; shotType; result: "MAKE"|"MISS"|"BLOCK"; contest; assistBy?; clock }
  | { t: "REBOUND"; player; side: "OFF"|"DEF"; clock }
  | { t: "TURNOVER"; player; cause: "STEAL"|"BAD_PASS"|"HANDLE"|"OFFENSIVE_FOUL"; stealBy?; clock }
  | { t: "FOUL";    player; on; type: "SHOOTING"|"PERSONAL"|"OFFENSIVE"; clock }
  | { t: "FREE_THROW"; player; result; index; total; clock }
  | { t: "SUB";     in; out; clock }        // P2
```

Box score = agrégation du log. Stats avancées (TS%, usage, eFG%, ORtg/DRtg, +/-) = formules standard appliquées au log. Le play-by-play affiché en mode live est un simple rendu textuel de ce même log.

## 10. Ce que la P1 ne fait PAS (rappel de scope)

Pas de tactiques ni de plays, pas de rotations (5 majeurs jouent ~36 min via un modèle de minutes naïf), pas de fatigue/blessures, pas de pression/mental, pas de fautes cumulées provoquant des sorties (limite à 6 fautes ignorée en P1). Les hooks existent dans les formules (`pressureModifier`, `gameStaminaFactor`...) mais renvoient 1.

## 11. Calibration (harnais batch)

Cibles ligue à valider sur ⚙ 50 saisons :

| Métrique | Cible |
|---|---|
| Points par équipe / match | 110-120 |
| FG% global | 46-48 % |
| Part des tirs à 3pts | 38-42 % |
| 3P% | 35-37 % |
| Turnovers / équipe / match | 12-15 |
| Rebonds offensifs | 26-28 % des rebonds disponibles |
| Victoires à domicile | 55-60 % |
| Meilleur scoreur de la ligue | 28-33 pts/match |
| Écart wins meilleure/pire équipe | ~60 vs ~15 |

Méthode : un script `batch/calibrate` fait varier les ⚙ un par un (analyse de sensibilité) et compare les distributions obtenues aux cibles.
