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
- `<canvas>` + plusieurs `<video>` muettes comme sources

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
2. **`hooks/useMontage.ts`** — branche le moteur au DOM : décodage, analyse,
   et une boucle `requestAnimationFrame` qui lit `audio.currentTime` comme
   horloge maître et dessine le clip actif sur le canvas (playhead/canvas
   écrits en DOM direct, pas de `setState` à 60 fps).
3. **`components/`** — `MontageStudio` (orchestration), `Stage` (canvas +
   timeline), `Controls` (sliders), `ClipTray` (clips), `Dropzone`.

## Réglages

| Réglage           | Effet                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Sensibilité**   | Plus bas = plus de beats. Plus haut = on garde les plus forts. |
| **Couper tous N** | Nervosité du montage : 1 = nerveux, 4+ = posé.                 |

## Déploiement

Application 100 % client → se déploie tel quel sur Vercel (aucune variable
d'environnement requise).
