# petit-site-de-montage

Montage vidéo **calé sur les beats**, 100 % navigateur. Tu importes une musique
et quelques clips ; le moteur détecte les beats sur la bande du kick, construit
une _edit decision list_ (où couper), et joue une **preview qui coupe en
rythme** sur un `<canvas>`. Rien n'est envoyé sur un serveur.

> Phase 1 = preview instantanée. Phase 2a = export vidéo temps réel par
> enregistrement du canvas (MediaRecorder), avec partage natif mobile.
> Phase 2b (plus tard) = export hors temps réel.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v3**
- **Web Audio API** pour le décodage / l'analyse (aucune dépendance audio tierce)
- `<canvas>` + **2 slots `<video>` en double-buffer** (jamais plus de 2 vidéos
  actives → compatible mobile)

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm start   # build de production
npm run lint                 # ESLint (next/core-web-vitals)
```

## Comment ça marche

1. **`lib/montage-engine.ts`** — le cœur, *pur* (aucun DOM hors décodage) :
   - `analyzeEnvelope()` : passe-bas → énergie RMS → flux (lourd, une fois).
   - `pickBeats()` : seuil adaptatif + pic d'onset (léger, re-calculé à chaque
     changement de sensibilité).
   - `buildEDL()` / `assignClipsToCuts()` : transforme les beats en points de
     coupe puis en segments `{ start, end, sourceIndex }`.
   - `computeEnergyCurve()` / `classifyBeats()` / `buildDynamicEDL()` :
     **montage dynamique** — niveau d'énergie du morceau (0-1, lissé ~2 s,
     normalisé par morceau), beats classés low/mid/high, et cadence modulée
     autour de la base : ×2 au calme, ÷2 quand ça tape. Chaque segment expose
     son énergie moyenne et sa zone (base de la future couche apprentissage).
2. **`lib/preview.ts`** — pont EDL → preview : `computeInPoints()` donne à
   chaque segment son point d'entrée dans le clip (proportionnel à la position
   dans le morceau), `findSegmentIndex()` suit le segment actif,
   `assignTransitions()` marque une coupe low sur deux en fondu enchaîné.
   **`lib/motion.ts`** affine ensuite : chaque clip est analysé à l'import
   (~24 échantillons 64×36, un seul `<video>` de travail, séquentiel et non
   bloquant) → courbe de mouvement 0-1 ; les segments high démarrent sur une
   fenêtre du clip qui bouge, les low sur une fenêtre calme (jamais la même
   deux fois de suite), mid et analyse-en-cours restent proportionnels. Les
   retouches manuelles gardent la priorité.
3. **`lib/effects.ts`** — vocabulaire d'effets piloté par l'énergie, regroupé
   dans une config (base des futurs « packs ») : flash blanc bref à l'entrée
   en zone high, micro-secousse + punch-in sur les coupes high, fondu
   enchaîné rapide (~250 ms) sur une coupe low sur deux. Sobre par principe :
   les effets marquent les moments forts.
4. **`lib/player.ts`** — lecture par segment en **double-buffer** : le slot
   courant joue (seeké à son `inPoint`), l'autre slot précharge + seek le clip
   du segment suivant pendant ce temps → coupe instantanée, et jamais plus de
   2 vidéos actives (les vignettes ne jouent jamais).
5. **`hooks/useMontage.ts`** — branche le tout au DOM : décodage, analyse,
   et une boucle `requestAnimationFrame` qui lit `audio.currentTime` comme
   horloge maître et dessine le slot courant sur le canvas (playhead/canvas
   écrits en DOM direct, pas de `setState` à 60 fps).
6. **`lib/explain.ts`** — la couche pédagogique : une phrase courte en
   français qui explique la décision de montage de chaque plan (zone, énergie,
   cadence, transition, effets), par templates variés — pas d'IA, instantané.
7. **`lib/exporter.ts`** — export vidéo (Phase 2a) : pendant une passe de
   lecture dédiée, `canvas.captureStream(30)` + l'audio routé via AudioContext
   vers les haut-parleurs ET un `MediaStreamDestination`, muxés par
   MediaRecorder (MP4 sur Safari, sinon WebM). Wake lock pendant la passe,
   partage natif (`navigator.share`) avec fallback téléchargement, filigrane
   discret uniquement à l'export (booléen — fondation freemium).
8. **`components/`** — `MontageStudio` (orchestration), `Stage` (canvas +
   transport), `Timeline` (blocs par segment colorés par zone, tap = seek +
   inspection), `SegmentInspector` (explication + retouches par plan : clip
   assigné et point d'entrée, stockées en overrides qui survivent aux
   re-calculs tant que les coupes ne bougent pas), `Controls`, `ClipTray`,
   `Dropzone`.

## Packs de styles

Quatre points de départ (`lib/packs.ts`), sélecteur de cartes au-dessus des
réglages — le pack applique sa config d'effets, sa cadence de base et ses
options visuelles, puis tout reste modifiable par-dessus :

| Pack | Signature |
| --- | --- |
| **Classique** | l'équilibre par défaut (punch + flash sur les moments forts) |
| **Nerveux** | cadence 1, punch 8 %, secousse 10 px, flash appuyé, zéro fondu |
| **Chill** | cadence 4, aucun effet brusque, fondu 400 ms sur toutes les coupes calmes |
| **Cinéma** | letterbox (2×12 %), fondus 500 ms, effets discrets |

Le letterbox est dessiné sur le canvas à chaque frame → il est aussi dans
l'export. Les explications pédagogiques citent le style quand il change le
comportement (« pas de flash ici — le style Chill adoucit tout »).

## Mode démo

`public/demo/demo.json` liste une musique + des clips d'exemple. Si les
fichiers sont présents (voir `public/demo/README.md`), l'écran d'accueil vide
propose « ✨ Essayer avec l'exemple » : les fichiers sont téléchargés puis
injectés dans le pipeline d'upload standard (aucune branche spéciale), et la
lecture démarre toute seule. Fichiers absents → le bouton reste caché.

## Réglages

| Réglage                | Effet                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| **Sensibilité**        | Plus bas = plus de beats. Plus haut = on garde les plus forts.                              |
| **Cadence (base)**     | Couper tous les N beats : 1 = nerveux, 4+ = posé.                                           |
| **Montage dynamique**  | ON (défaut) : l'énergie module la cadence (low ×2, high ÷2) + punch-in sur les coupes high. |

## Déploiement

Application 100 % client → se déploie tel quel sur Vercel (aucune variable
d'environnement requise).
