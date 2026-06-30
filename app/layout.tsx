import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Petit site de montage — montage vidéo calé sur les beats",
  description:
    "Importe une musique et des clips : on détecte les beats et on monte une preview qui coupe en rythme. 100% navigateur, aucun upload serveur.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="font-sans text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
