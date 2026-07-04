/**
 * exporter.ts
 * ----------------------------------------------------------------------------
 * Export vidéo par enregistrement du canvas (Phase 2a) : pendant une passe de
 * lecture dédiée, on capture canvas.captureStream() + l'audio (routé via
 * AudioContext vers les haut-parleurs ET un MediaStreamDestination), et
 * MediaRecorder muxe le tout. Temps réel par construction : exporter 3 min de
 * montage prend 3 min. L'export rendu-par-rendu (hors temps réel) viendra en
 * Phase 2b.
 *
 * Ici : la config et les briques pures/testables. La machinerie (recorder,
 * wake lock, cycle de vie) vit dans useMontage.
 * ----------------------------------------------------------------------------
 */

export interface ExportConfig {
  /** Cadence de capture du canvas. */
  fps: number;
  /** Débit vidéo cible du MediaRecorder. */
  videoBitsPerSecond: number;
  /**
   * Filigrane dessiné sur le canvas UNIQUEMENT pendant l'export. C'est la
   * fondation freemium : l'offre payante passera ce booléen à false.
   */
  watermark: boolean;
  watermarkText: string;
}

export const DEFAULT_EXPORT: ExportConfig = {
  fps: 30,
  videoBitsPerSecond: 8_000_000,
  watermark: true,
  watermarkText: "petit-site-de-montage",
};

export interface ExportMime {
  mimeType: string;
  extension: string;
}

/**
 * Premier conteneur supporté, dans l'ordre : MP4 (Safari — WebM n'y est pas
 * enregistrable), puis WebM VP9+Opus, puis WebM générique. `isSupported` est
 * injecté (MediaRecorder.isTypeSupported en prod) pour rester testable.
 */
export function pickExportMimeType(
  isSupported: (mimeType: string) => boolean
): ExportMime | null {
  const candidates: ExportMime[] = [
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];
  for (const c of candidates) {
    try {
      if (isSupported(c.mimeType)) return c;
    } catch {
      /* isTypeSupported qui jette = non supporté */
    }
  }
  return null;
}

/**
 * Filigrane discret en bas à droite : texte semi-transparent, taille relative
 * à la hauteur du canvas. `credit` (piste de la bibliothèque de sons) se
 * dessine en plus petit juste au-dessus — les artistes sont crédités sur les
 * montages partagés. À n'appeler qu'après avoir peint la frame (sinon
 * l'alpha s'accumule d'une frame à l'autre).
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  credit?: string
): void {
  const margin = Math.round(height * 0.03);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 4;
  ctx.font = `600 ${Math.round(height * 0.035)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(text, width - margin, height - margin);
  if (credit) {
    ctx.font = `500 ${Math.round(height * 0.025)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(credit, width - margin, height - margin - Math.round(height * 0.04));
  }
  ctx.restore();
}
