/**
 * library.ts
 * ----------------------------------------------------------------------------
 * Bibliothèque de sons intégrée : un manifeste statique
 * (public/sounds/library.json) liste des morceaux prêts à l'emploi. Le choix
 * d'une piste passe par le pipeline d'upload STANDARD (fetchAsFile → File →
 * loadAudio), exactement comme le mode démo — zéro branche spéciale. Le
 * `credit` de la piste suit l'audio actif et s'incruste dans le filigrane
 * d'export : les artistes sont crédités sur les montages partagés.
 * ----------------------------------------------------------------------------
 */

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  /** Un mot : « dur », « chill »… */
  mood: string;
  /** Chemin du fichier audio sous public/. */
  file: string;
  /** Texte court affiché + incrusté à l'export, ex. « Musique : NTHN ». */
  credit: string;
  bpm?: number;
}

/**
 * Valide le manifeste avec la même méfiance que demo.json : données
 * externes, on ne garde que les entrées complètes (id unique, champs texte
 * non vides), bpm optionnel s'il est un nombre plausible. Manifeste
 * malformé, absent ou vide → tableau vide → la galerie ne s'affiche pas.
 */
export function parseLibrary(data: unknown): LibraryTrack[] {
  if (!data || typeof data !== "object") return [];
  const arr = (data as { tracks?: unknown }).tracks;
  if (!Array.isArray(arr)) return [];

  const out: LibraryTrack[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
    if (!str(t.id) || seen.has(t.id)) continue;
    if (!str(t.title) || !str(t.artist) || !str(t.mood) || !str(t.file) || !str(t.credit)) {
      continue;
    }
    const bpm =
      typeof t.bpm === "number" && Number.isFinite(t.bpm) && t.bpm > 0 && t.bpm < 1000
        ? Math.round(t.bpm)
        : undefined;
    seen.add(t.id);
    out.push({
      id: t.id,
      title: t.title,
      artist: t.artist,
      mood: t.mood,
      file: t.file,
      credit: t.credit,
      ...(bpm !== undefined ? { bpm } : {}),
    });
  }
  return out;
}
