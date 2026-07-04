# petit-site-de-montage

Montage vidéo **calé sur les beats**, 100 % navigateur. Tu importes une musique
et quelques clips ; le moteur détecte les beats sur la bande du kick, construit
une _edit decision list_ (où couper), et joue une **preview qui coupe en
rythme** sur un `<canvas>`. Rien n'est envoyé sur un serveur.

> Phase 1 = preview instantanée (ce repo). Phase 2 = export vidéo.

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
7. **`components/`** — `MontageStudio` (orchestration), `Stage` (canvas +
   transport), `Timeline` (blocs par segment colorés par zone, tap = seek +
   inspection), `SegmentInspector` (explication + retouches par plan : clip
   assigné et point d'entrée, stockées en overrides qui survivent aux
   re-calculs tant que les coupes ne bougent pas), `Controls`, `ClipTray`,
   `Dropzone`.

## Réglages

| Réglage                | Effet                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| **Sensibilité**        | Plus bas = plus de beats. Plus haut = on garde les plus forts.                              |
| **Cadence (base)**     | Couper tous les N beats : 1 = nerveux, 4+ = posé.                                           |
| **Montage dynamique**  | ON (défaut) : l'énergie module la cadence (low ×2, high ÷2) + punch-in sur les coupes high. |

## Déploiement

Application 100 % client → se déploie tel quel sur Vercel (aucune variable
d'environnement requise).
