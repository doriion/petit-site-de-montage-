"use client";

import { useCallback, useRef, useState } from "react";

interface DropzoneProps {
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList | File[]) => void;
  title: string;
  hint: string;
  icon: React.ReactNode;
  className?: string;
}

/** Zone de dépôt réutilisable : clic pour parcourir, ou glisser-déposer. */
export default function Dropzone({
  accept,
  multiple = false,
  onFiles,
  title,
  hint,
  icon,
  className = "",
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hover, setHover] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setHover(false);
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
    [onFiles]
  );

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
      className={`group flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        hover
          ? "border-accent bg-accent/5"
          : "border-ink-600 bg-ink-800/40 hover:border-ink-600/80 hover:bg-ink-800/70"
      } ${className}`}
    >
      <span
        className={`text-2xl transition-transform group-hover:scale-110 ${
          hover ? "text-accent" : "text-zinc-400"
        }`}
      >
        {icon}
      </span>
      <span className="text-sm font-medium text-zinc-200">{title}</span>
      <span className="text-xs text-zinc-500">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ""; // permet de re-sélectionner le même fichier
        }}
      />
    </button>
  );
}
