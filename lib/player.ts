/**
 * player.ts
 * ----------------------------------------------------------------------------
 * Lecture par segment en double-buffer : au plus DEUX <video> actives — le
 * slot courant qui joue, et l'autre slot qui précharge + seek le clip du
 * segment suivant pendant ce temps. À la coupe, on échange les rôles : la
 * vidéo suivante est déjà décodée au bon endroit, la coupe est instantanée.
 * C'est aussi ce qui rend la preview viable sur mobile (les navigateurs
 * limitent le nombre de vidéos qui jouent/décodent simultanément).
 *
 * Client uniquement (manipule des HTMLVideoElement), mais rien au chargement
 * du module — importable sans risque depuis du code Next.js.
 * ----------------------------------------------------------------------------
 */

import type { Clip, Segment } from "./preview";

/** Au-delà, on abandonne la préparation (fichier corrompu, codec inconnu…). */
const PREPARE_TIMEOUT_MS = 5000;

/** Tolérance sous laquelle on ne re-seek pas (évite les seeks parasites). */
const SEEK_EPSILON_S = 0.08;

/** Attend `event` (ou "error"), résout false sur erreur/timeout. */
function waitEvent(
  el: HTMLMediaElement,
  event: string,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const onEvent = () => finish(true);
    const onError = () => finish(false);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    function finish(ok: boolean) {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
      resolve(ok);
    }
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

export class VideoSlot {
  private el_: HTMLVideoElement | null = null;
  /** Incrémenté à chaque préparation/invalidation : annule les prépas en vol. */
  private token = 0;
  /** Id du clip actuellement chargé dans l'élément (évite les re-set de src). */
  private clipId: string | null = null;
  /** Index du segment pour lequel ce slot est prêt (-1 = pas prêt). */
  preparedSeg = -1;

  get el(): HTMLVideoElement | null {
    return this.el_;
  }

  attach(el: HTMLVideoElement | null): void {
    if (el === this.el_) return;
    this.el_ = el;
    this.clipId = null;
    this.preparedSeg = -1;
    this.token++;
    if (el) {
      // Ceintures + bretelles pour l'autoplay mobile (React pose déjà les props).
      el.muted = true;
      el.loop = true;
      el.setAttribute("playsinline", "");
    }
  }

  /** Le mapping segments/clips a changé : tout ce qui est préparé est caduc. */
  invalidate(): void {
    this.preparedSeg = -1;
    this.token++;
  }

  /** Le clip `clipId` a été retiré (URL révoquée) : décharge-le si présent. */
  detachClip(clipId: string): void {
    if (this.clipId !== clipId) return;
    this.reset();
  }

  reset(): void {
    this.clipId = null;
    this.preparedSeg = -1;
    this.token++;
    if (this.el_) {
      this.el_.pause();
      this.el_.removeAttribute("src");
      this.el_.load();
    }
  }

  /**
   * Prépare ce slot pour `segments[segIndex]` : charge le clip si besoin puis
   * seek à `inPoint + offset` (offset = position déjà écoulée dans le segment,
   * pour les seeks utilisateur en plein segment). Laisse la vidéo EN PAUSE,
   * prête à jouer. Résout true si le slot est prêt ; false si la préparation
   * a été annulée (nouvelle prépa, invalidation) ou a échoué.
   */
  async prepare(
    segIndex: number,
    seg: Segment,
    clip: Clip,
    offsetSec: number
  ): Promise<boolean> {
    const el = this.el_;
    if (!el) return false;
    const myToken = ++this.token;
    this.preparedSeg = -1;

    if (this.clipId !== clip.id) {
      this.clipId = clip.id;
      el.pause();
      el.src = clip.url;
      const ok = await waitEvent(el, "loadedmetadata", PREPARE_TIMEOUT_MS);
      if (!ok || myToken !== this.token) return false;
    }

    let target = (seg.inPoint ?? 0) + Math.max(0, offsetSec);
    const dur = el.duration;
    if (Number.isFinite(dur) && dur > 0.2) {
      // Clip plus court que le point visé : on reboucle (cohérent avec loop).
      target = target % dur;
      // Rester un cheveu avant la fin pour ne pas tomber sur "ended".
      target = Math.min(target, Math.max(0, dur - SEEK_EPSILON_S));
    }
    // Durée inconnue (WebM MediaRecorder…) : on tente le seek tel quel, le
    // navigateur clampe sur ce qui est seekable.

    if (Math.abs(el.currentTime - target) > SEEK_EPSILON_S) {
      el.currentTime = target;
      const ok = await waitEvent(el, "seeked", PREPARE_TIMEOUT_MS);
      if (!ok || myToken !== this.token) return false;
    }

    if (myToken !== this.token) return false;
    this.preparedSeg = segIndex;
    return true;
  }
}
