/**
 * demo.ts
 * ----------------------------------------------------------------------------
 * Mode démo instantané : un manifeste statique (public/demo/demo.json) liste
 * une musique + des clips d'exemple. Au clic, on les télécharge et on les
 * matérialise en File — exactement ce que produit un <input type="file"> —
 * pour réutiliser le pipeline d'upload standard, sans branche spéciale.
 * ----------------------------------------------------------------------------
 */

export interface DemoManifest {
  audio: string;
  clips: string[];
}

/** Valide le manifeste (données externes → on ne fait confiance à rien). */
export function parseDemoManifest(data: unknown): DemoManifest | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { audio?: unknown; clips?: unknown };
  if (typeof d.audio !== "string" || d.audio.length === 0) return null;
  if (!Array.isArray(d.clips) || d.clips.length === 0) return null;
  if (!d.clips.every((c) => typeof c === "string" && c.length > 0)) return null;
  return { audio: d.audio, clips: d.clips as string[] };
}

export function filenameFromPath(path: string): string {
  const base = path.split("/").pop() ?? "";
  return base.split("?")[0] || "demo";
}

/**
 * Télécharge un fichier de démo et le matérialise en File. Le type MIME vient
 * du Content-Type du serveur ; s'il est vide, le nom garde son extension et
 * le filtre d'import par extension prend le relais.
 */
export async function fetchAsFile(path: string): Promise<File> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filenameFromPath(path), { type: blob.type });
}
