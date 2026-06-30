import MontageStudio from "@/components/MontageStudio";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-beat" />
          100% navigateur · rien n&apos;est envoyé sur un serveur
        </div>
        <h1 className="text-3xl font-black tracking-tight text-zinc-50 sm:text-4xl">
          Petit site de{" "}
          <span className="bg-gradient-to-r from-accent to-beat-soft bg-clip-text text-transparent">
            montage
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
          Glisse une musique et quelques clips. On détecte les beats sur la bande
          du kick et on assemble une preview qui{" "}
          <span className="text-zinc-200">coupe en rythme</span>. Joue avec la
          sensibilité et la nervosité du montage en temps réel.
        </p>
      </header>

      <MontageStudio />

      <footer className="mt-12 border-t border-ink-700 pt-6 text-xs text-zinc-600">
        <p>
          La preview est rendue à la volée à partir d&apos;une{" "}
          <span className="text-zinc-400">edit decision list</span> (les points de
          coupe). L&apos;export vidéo arrive en Phase 2.
        </p>
      </footer>
    </main>
  );
}
