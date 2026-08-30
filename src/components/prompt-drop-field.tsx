"use client";

import { useEffect, useRef, useState } from "react";
import {
  caretIndexFromPointInEditable,
  caretRectRelativeToRoot,
} from "@/lib/textarea-caret";

type Props = {
  value: string;
  disabled?: boolean;
  dropOver?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
  onBlurSave: () => void;
  onDropFiles: (files: File[], charIndex: number) => void;
  onDropAsset?: (assetId: string, charIndex: number) => void;
  onDropOverChange: (over: boolean) => void;
};

function isFileDrag(e: React.DragEvent) {
  return Array.from(e.dataTransfer.types).includes("Files");
}

function isLibraryAssetDrag(dt: DataTransfer) {
  return Array.from(dt.types).includes("text/shotflow-asset-id");
}

function firstImageFile(dt: DataTransfer): File | null {
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  const files = Array.from(dt.files ?? []);
  return files.find((f) => f.type.startsWith("image/")) ?? null;
}

export function PromptDropField({
  value,
  disabled,
  dropOver,
  placeholder,
  onChange,
  onBlurSave,
  onDropFiles,
  onDropAsset,
  onDropOverChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ghostUrlRef = useRef<string | null>(null);
  const [caret, setCaret] = useState<{
    index: number;
    left: number;
    top: number;
    height: number;
  } | null>(null);
  const [ghost, setGhost] = useState<{
    url: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerText !== value) {
      el.innerText = value || "";
    }
  }, [value]);

  function clearGhost() {
    if (ghostUrlRef.current) {
      URL.revokeObjectURL(ghostUrlRef.current);
      ghostUrlRef.current = null;
    }
    setGhost(null);
  }

  function trackGhost(e: React.DragEvent) {
    const x = e.clientX + 16;
    const y = e.clientY + 16;
    if (ghostUrlRef.current) {
      setGhost({ url: ghostUrlRef.current, x, y });
      return;
    }
    const file = firstImageFile(e.dataTransfer);
    if (!file) return;
    const url = URL.createObjectURL(file);
    ghostUrlRef.current = url;
    setGhost({ url, x, y });
  }

  function readText() {
    return (ref.current?.innerText ?? "").replace(/\u00a0/g, " ");
  }

  function updateCaret(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    if (
      clientX < box.left ||
      clientX > box.right ||
      clientY < box.top ||
      clientY > box.bottom
    ) {
      setCaret(null);
      return null;
    }
    const index = caretIndexFromPointInEditable(el, clientX, clientY);
    const rect = caretRectRelativeToRoot(el, index);
    if (!rect) {
      setCaret(null);
      return index;
    }
    setCaret({ index, ...rect });
    return index;
  }

  /** 插入条约为当前行高的 1.5 倍，避免盖住上下行 */
  const caretH = caret ? caret.height * 1.5 : 0;

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={`relative w-full min-h-[200px] overflow-auto whitespace-pre-wrap rounded-sm border bg-white/70 px-3 py-2 font-mono text-sm leading-relaxed text-ink outline-none transition-[border-color,box-shadow,background-color] duration-150 empty:before:pointer-events-none empty:before:text-ink/35 empty:before:content-[attr(data-placeholder)] ${
          dropOver
            ? "caret-transparent border-accent bg-accent/5 ring-2 ring-accent/30"
            : "border-ink/15 focus:border-accent"
        } ${disabled ? "opacity-60" : ""}`}
        onInput={() => onChange(readText())}
        onBlur={() => {
          onChange(readText());
          onBlurSave();
        }}
        onDragEnter={(e) => {
          if (disabled) return;
          if (!isFileDrag(e) && !isLibraryAssetDrag(e.dataTransfer)) return;
          e.preventDefault();
          onDropOverChange(true);
        }}
        onDragOver={(e) => {
          if (disabled) return;
          if (!isFileDrag(e) && !isLibraryAssetDrag(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          onDropOverChange(true);
          updateCaret(e.clientX, e.clientY);
          if (isFileDrag(e)) trackGhost(e);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setCaret(null);
            clearGhost();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropOverChange(false);
          if (disabled) return;
          const idx = updateCaret(e.clientX, e.clientY) ?? value.length;
          setCaret(null);
          clearGhost();
          const assetId = e.dataTransfer.getData("text/shotflow-asset-id");
          if (assetId && onDropAsset) {
            onDropAsset(assetId, idx);
            return;
          }
          const files = Array.from(e.dataTransfer.files ?? []);
          if (!files.length) return;
          onDropFiles(files, idx);
        }}
      />
      {caret ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-20"
          style={{
            left: caret.left,
            top: caret.top + caret.height / 2 - caretH / 2,
            height: caretH,
          }}
        >
          <span className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-accent px-2.5 py-1 text-sm font-medium text-white shadow-md">
            插入
          </span>
          <span className="absolute top-0 left-0 h-full w-3 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_0_6px_rgba(15,110,86,0.3)]" />
        </span>
      ) : null}
      {ghost ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ghost.url}
          alt=""
          className="pointer-events-none fixed z-50 rounded-sm object-cover opacity-80 ring-2 ring-white shadow-lg"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: 16,
            height: 16,
          }}
        />
      ) : null}
    </div>
  );
}
