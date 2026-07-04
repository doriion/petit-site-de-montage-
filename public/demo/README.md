# Fichiers de démo

Servis par le bouton « ✨ Essayer avec l'exemple » (manifeste : `demo.json`) :

- `demo-track-126bpm.m4a` — le morceau d'exemple (126 BPM)
- `demo-calme-drift.mp4` — clip calme
- `demo-moyen-grid.mp4` — clip moyen
- `demo-nerveux-particules.mp4` — clip nerveux
- `demo-nerveux-strobe.mp4` — clip nerveux

Pour changer la démo : remplace les fichiers et ajuste les chemins dans
`demo.json`, puis rebuild/redeploy (la liste des fichiers `public/` est figée
au build). Si le fichier audio est absent, le bouton reste caché.
