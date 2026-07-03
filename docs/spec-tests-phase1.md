# Spec — Plan de tests Phase 1 (FBLM)

> Statut : v1. Un moteur de simulation ne se teste pas comme une app classique : les sorties sont probabilistes. On combine donc 5 familles de tests, des plus déterministes aux plus statistiques.

---

## 1. Tests unitaires déterministes (vitest)

### RNG seedé
- Même seed → séquence strictement identique (comparer 1 000 tirages)
- Deux seeds différentes → séquences différentes
- Les distributions élémentaires (uniforme, gaussienne bornée, tirage pondéré) respectent leurs bornes
- **Aucun `Math.random()` dans le code** : test statique (grep sur /engine) qui échoue si l'API native est utilisée

### Génération de la ligue
- Exactement 30 équipes, 2 conférences de 15, 6 divisions de 5
- 15 joueurs par roster, numéros de maillot uniques par équipe
- Aucun nom réel : test qui compare les sorties du générateur à une liste de noms/villes NBA interdits (garde-fou anonymisation)
- Cohérence physique : taille dans [175, 225], envergure ≥ taille et ≤ taille +15, poids plausible vs taille, distribution des tailles cohérente par poste (les C plus grands que les PG)
- Chaque joueur a un archétype valide et ses attributs respectent les fourchettes de la spec (± tolérance hors-archétype ~10 %)
- Traits mentaux : jamais deux traits mutuellement exclusifs (Tueur/Peur, Métronome/Irrégulier), maximum 3 traits

### Résolution d'une possession (avec RNG mocké/forcé)
En forçant les tirages du RNG, vérifier chaque branche de la machine à états :
- Tir réussi → points corrects (2 ou 3), possession adverse ensuite
- Tir raté → rebond déclenché ; rebond off → nouvelle action, rebond def → changement de possession
- Turnover → zéro point, changement de possession
- Faute de tir → 2 ou 3 LF selon la zone, and-one → 1 LF
- Contre → comptabilisé au contreur, suivi d'un rebond
- Passe décisive créditée seulement si tir réussi ≤ 1 action après la passe
- Maximum de passes par possession respecté
- `pMake` toujours borné dans [0.05, 0.85] quelles que soient les valeurs d'attributs (tester avec des joueurs 0 partout et 99 partout)

### Horloge et structure de match
- Une possession consomme entre 4 et 24 s
- Fin de quart-temps tronque correctement la possession en cours
- Score égal à la fin du temps réglementaire → prolongation de 5 min, répétable
- Somme des points du log d'événements == score final du match (invariant fondamental)

### Agrégation du log (box scores)
- Sur un log construit à la main : points, rebonds, passes, TO, minutes exacts
- Stats avancées (TS%, eFG%, usage) conformes aux formules standard sur des cas connus
- La somme des stats individuelles == stats d'équipe

### Saison et playoffs
- Calendrier : 82 matchs par équipe, répartition domicile/extérieur 41/41, pondération division/conférence correcte
- Classement : tri par bilan, tie-breakers appliqués dans l'ordre spécifié
- Play-in : les seeds 7-10 jouent le bon format, les qualifiés sortent aux bonnes places
- Bracket playoffs : appariements 1-8/2-7..., avantage du terrain à la meilleure seed, une série s'arrête à 4 victoires

## 2. Tests de propriétés (property-based, sur ~1 000 matchs seedés)

Invariants qui doivent tenir sur n'importe quel match, quelle que soit la seed :
- Aucun score négatif, aucun score < 60 ou > 200
- Aucune stat individuelle aberrante : joueur ≤ 100 pts, ≤ 40 reb, ≤ 35 ast
- Minutes d'équipe == 240 (ou 240 + 25 par prolongation)
- FGM ≤ FGA, 3PM ≤ 3PA ≤ FGA, FTM ≤ FTA pour chaque joueur
- Possessions des deux équipes égales à ±2 près
- Le log d'événements est chronologiquement cohérent (horloge décroissante par quart-temps)
- Déterminisme de bout en bout : simuler deux fois le même match avec la même seed → logs strictement identiques

## 3. Tests statistiques (harnais batch, cibles de calibration)

Sur ⚙ 10 saisons simulées (CI rapide) et 50 saisons (validation complète), moyennes ligue dans les cibles de la spec possession §11 :

| Métrique | Borne basse | Borne haute |
|---|---|---|
| Points/équipe/match | 108 | 122 |
| FG% | 45 % | 49 % |
| Part de tirs à 3pts | 36 % | 44 % |
| 3P% | 34 % | 38 % |
| TO/équipe/match | 11 | 16 |
| Rebonds offensifs | 24 % | 30 % |
| Victoires à domicile | 53 % | 62 % |
| Meilleur scoreur ligue | 26 pts | 35 pts |
| Meilleure équipe | 55 wins | 68 wins |
| Pire équipe | 10 wins | 22 wins |

Plus deux vérifications de bon sens :
- **Corrélation talent → résultats** : le rating moyen d'une équipe doit corréler positivement avec ses victoires (r > 0.7). Si non, les attributs ne pilotent pas la simu.
- **Distribution des wins** : pas de mur artificiel (personne à 82-0 ou 0-82), forme globalement en cloche étalée.

Ces tests tournent en **warning** au début (calibration en cours) puis passent en **bloquants** une fois la phase 1 déclarée stable.

## 4. Golden master (anti-régression)

- Une seed de référence (`GOLDEN_SEED`) → simuler 1 saison complète → hasher le log d'événements complet → comparer au hash committé
- Tout changement de comportement du moteur casse le test : si le changement est volontaire (retuning), on régénère le golden explicitement (`npm run golden:update`) et le diff des distributions batch est joint au commit
- C'est le filet de sécurité principal quand Claude Code refactore le moteur

## 5. Performance

- 1 saison complète (1 230 matchs + playoffs) en < 60 s sur machine de dev (cible spec)
- 1 match en < 50 ms en moyenne
- Batch de 50 saisons sans fuite mémoire (heap stable entre les saisons)

---

## Organisation pratique

```
/engine/**/*.test.ts        # unitaires colocalisés (familles 1)
/tests/properties/          # property-based (famille 2)
/tests/golden/              # golden master + seed de référence (famille 4)
/batch/calibrate.ts         # famille 3, sortie = rapport de distributions
```

- CI locale : `npm test` = familles 1, 2, 4 + batch 10 saisons (< 2 min au total)
- Validation de phase : `npm run validate:p1` = tout, dont batch 50 saisons
- Chaque bug de simulation trouvé à la main → reproduit d'abord par un test unitaire avec la seed fautive, puis corrigé

## Definition of done — Phase 1

☐ Familles 1, 2, 4, 5 vertes
☐ Famille 3 verte en mode bloquant sur 50 saisons
☐ Corrélation talent/wins > 0.7
☐ Inspection manuelle : 3 box scores lus par un humain "ressemblent à du basket"
