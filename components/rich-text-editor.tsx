"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { htmlToEditorHtml, stripHtml } from "@/lib/utils";

type RichTextEditorProps = {
  value: string;
  onChange: (nextHtml: string) => void;
  placeholder?: string;
  // Base font for the editor (used to overwrite the web/app default font).
  baseFontFamilyCss?: string;
  // Font face name for keeping the dropdown in sync with the base font.
  baseFontFace?: string;
};

// Simplified to 4 VERY DISTINCT fonts as per user request
const FONT_OPTIONS: Array<{
  label: string;
  execFace: string;
  styleValue: string; 
}> = [
  {
    label: "Default Handwriting",
    execFace: "Mynerve",
    styleValue: "var(--font-handwriting), 'Mynerve', cursive",
  },
  {
    label: "Elegant Serif",
    execFace: "Playfair Display",
    styleValue: "'Playfair Display', serif",
  },
  {
    label: "Modern Sans",
    execFace: "Montserrat",
    styleValue: "'Montserrat', sans-serif",
  },
  {
    label: "Romantic Script",
    execFace: "Satisfy",
    styleValue: "'Satisfy', cursive",
  },
  {
    label: "Bold Display",
    execFace: "Pacifico",
    styleValue: "'Pacifico', cursive",
  },
  {
    label: "Logic Mono",
    execFace: "JetBrains Mono",
    styleValue: "'JetBrains Mono', monospace",
  },
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your thoughts...",
  baseFontFamilyCss,
  baseFontFace,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  
  // Font selection for the dropdown
  const [selectedFontFace, setSelectedFontFace] = useState<string>(
    baseFontFace || FONT_OPTIONS[0]!.execFace
  );
  
  const [currentFontFamilyCss, setCurrentFontFamilyCss] = useState<string>(
    baseFontFamilyCss || FONT_OPTIONS[0]!.styleValue
  );

  // Sync props from parent (e.g. when changing notebook theme)
  useEffect(() => {
    if (baseFontFace) {
      setSelectedFontFace(baseFontFace);
    }
    if (baseFontFamilyCss) {
      setCurrentFontFamilyCss(baseFontFamilyCss);
      if (editorRef.current) {
        editorRef.current.style.fontFamily = baseFontFamilyCss;
      }
    }
  }, [baseFontFace, baseFontFamilyCss]);

  const desiredHtml = useMemo(() => {
    return htmlToEditorHtml(value);
  }, [value]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Only update if external value is logically different to avoid cursor jumps
    if (el.innerHTML === desiredHtml) return;
    el.innerHTML = desiredHtml;
  }, [desiredHtml]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
  };

  const exec = (command: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    // eslint-disable-next-line deprecation/deprecation
    document.execCommand(command);
    emitChange();
  };

  const applyFontToAll = (execFace: string, styleValue: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    // 1. Force the container to take the appearance
    el.style.fontFamily = styleValue;

    // 2. Aggressively unify the whole note by stripping internal font-family overrides
    const styledChildren = el.querySelectorAll('[style*="font-family"]');
    styledChildren.forEach((child) => {
      (child as HTMLElement).style.fontFamily = "";
      if (!(child as HTMLElement).getAttribute("style")) {
        child.removeAttribute("style");
      }
    });
    
    // Remove legacy font tags
    const fontTags = el.querySelectorAll("font");
    fontTags.forEach((tag) => {
      const span = document.createElement("span");
      span.innerHTML = tag.innerHTML;
      tag.replaceWith(span);
    });

    // 3. Bake the font choice into the root of the content to ensure persistence
    // We wrap everything in a special span that our sanitizer allows
    const currentInner = el.innerHTML;
    el.innerHTML = `<span style="font-family: ${styleValue}">${currentInner}</span>`;

    // 4. Update browser's typing context
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("fontName", false, execFace);
    } catch {
      // ignore
    }

    emitChange();
    
    // Attempt to move cursor to the end
    const lastNode = el.lastChild;
    if (lastNode) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
  };

  const showPlaceholder = stripHtml(value).length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap bg-gray-50 p-2 rounded-md border border-gray-100">
        <button
          type="button"
          onClick={() => exec("bold")}
          className="px-3 py-1 rounded-md border border-gray-200 text-gray-800 hover:bg-gray-100 bg-white text-sm font-bold"
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => exec("italic")}
          className="px-3 py-1 rounded-md border border-gray-200 text-gray-800 hover:bg-gray-100 bg-white text-sm italic"
          aria-label="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => exec("underline")}
          className="px-3 py-1 rounded-md border border-gray-200 text-gray-800 hover:bg-gray-100 bg-white text-sm underline"
          aria-label="Underline"
        >
          U
        </button>
        
        <div className="w-[1px] h-6 bg-gray-200 mx-1" />

        <select
          className="ml-auto px-3 py-1 rounded-md border border-gray-200 text-gray-800 bg-white text-sm font-medium focus:ring-2 focus:ring-pink-200 outline-none cursor-pointer"
          value={selectedFontFace}
          onChange={(e) => {
            const opt = FONT_OPTIONS.find((f) => f.execFace === e.target.value);
            if (!opt) return;
            setSelectedFontFace(opt.execFace);
            setCurrentFontFamilyCss(opt.styleValue);
            applyFontToAll(opt.execFace, opt.styleValue);
          }}
          aria-label="Font Family"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.execFace} value={opt.execFace}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        {showPlaceholder && (
          <div className="pointer-events-none absolute left-3 top-3 text-gray-400 select-none">
            {placeholder}
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          className="min-h-[200px] text-base leading-relaxed resize-none w-full border border-gray-200 rounded-lg px-4 py-4 focus:outline-none focus:ring-2 focus:ring-pink-100 bg-white shadow-inner"
          style={{
            fontFamily: currentFontFamilyCss || undefined,
          }}
        />
      </div>
    </div>
  );
}
