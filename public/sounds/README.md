# Bibliothèque de sons

`library.json` liste les morceaux proposés dans la galerie « 1 · La musique ».

Ajouter une piste = déposer le fichier audio ici (ou ailleurs sous `public/`)
et ajouter une entrée dans `tracks` :

```json
{
  "id": "identifiant-unique",
  "title": "Titre affiché",
  "artist": "Artiste",
  "bpm": 126,
  "mood": "dur",
  "file": "/sounds/mon-morceau.m4a",
  "credit": "Musique : Artiste"
}
```

- `bpm` est optionnel ; `mood` est un mot (« dur », « chill »…).
- `credit` est affiché près du lecteur ET incrusté dans le filigrane des
  exports — les artistes sont crédités sur les montages partagés, c'est le
  deal.
- Entrée invalide → ignorée ; manifeste absent ou vide → la galerie ne
  s'affiche pas (import seul).
- La liste des fichiers `public/` est figée au build : rebuild/redeploy après
  ajout d'un fichier.
