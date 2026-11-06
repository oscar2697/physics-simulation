"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

import { documentFileUrl, interpretDocumentStream, listDocuments } from "@/hooks/useAgentSocket";
import { usePhysicsStore } from "@/hooks/usePhysicsState";
import { fallbackCueMap } from "@/lib/cues";
import type { DocumentInfo } from "@/types/physics";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PAGE_GAP = 14;
const ESTIMATED_PAGE_ASPECT = 1.414;
const KEEP_WINDOW = 10;
const SLICE_BEHIND = 24;
const SLICE_AHEAD = 16;
const READ_LINE_FRACTION = 0.32;
const INTERPRET_PAGE_CAP = 120;
const INTERPRET_TEXT_CAP = 4000;

function matchesKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

function extractPageText(items: Array<TextItemLike | Record<string, unknown>>): string {
  let text = "";
  for (const item of items) {
    const typed = item as TextItemLike;
    if (typeof typed.str === "string") text += typed.str;
    if (typed.hasEOL) text += "\n";
  }
  return text
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pinKeywordCues(
  pdf: PDFDocumentProxy,
  textCache: Map<number, string>,
  isCancelled: () => boolean
): Promise<void> {
  for (let p = 1; p <= pdf.numPages; p++) {
    if (isCancelled()) return;
    const text = textCache.get(p);
    if (!text) continue;
    const lower = text.toLowerCase();
    for (const cue of usePhysicsStore.getState().cues) {
      if (cue.pinnedPage === null && cue.at.keywords?.some((kw) => matchesKeyword(lower, kw))) {
        usePhysicsStore.getState().pinCue(cue.id, p);
        break;
      }
    }
  }
}

export default function PdfReader() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageHeights, setPageHeights] = useState<Map<number, number>>(new Map());
  const [pageAspect, setPageAspect] = useState(ESTIMATED_PAGE_ASPECT);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const textCacheRef = useRef<Map<number, string>>(new Map());
  const pageOffsetsRef = useRef<number[]>([0]);
  const lastScrollNonceRef = useRef(0);
  const interpretStartedRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const setDocument = usePhysicsStore((s) => s.setDocument);
  const loadCuesFor = usePhysicsStore((s) => s.loadCuesFor);
  const setReading = usePhysicsStore((s) => s.setReading);
  const setActiveDocumentContext = usePhysicsStore((s) => s.setDocumentContext);
  const scrollToPage = usePhysicsStore((s) => s.scrollToPage);
  const requestScrollToPage = usePhysicsStore((s) => s.requestScrollToPage);
  const jumpToCue = usePhysicsStore((s) => s.jumpToCue);
  const cues = usePhysicsStore((s) => s.cues);
  const activeCueIndex = usePhysicsStore((s) => s.activeCueIndex);
  const interpretStatus = usePhysicsStore((s) => s.interpretStatus);
  const interpretLabel = usePhysicsStore((s) => s.interpretLabel);

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(Math.max(0, Math.floor(width - 24)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageOffsets = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 1; i <= numPages; i++) {
      const h =
        pageHeights.get(i) ??
        (containerWidth > 0 ? containerWidth * pageAspect : 800);
      offsets.push(offsets[i - 1] + h + PAGE_GAP);
    }
    return offsets;
  }, [numPages, pageHeights, containerWidth, pageAspect]);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollRef.current;
      if (!el || numPages === 0) return;
      const scrollTop = el.scrollTop;
      const focusPoint = scrollTop + el.clientHeight * READ_LINE_FRACTION;
      let page = numPages;
      for (let i = 1; i <= numPages; i++) {
        if (focusPoint < pageOffsets[i]) {
          page = i;
          break;
        }
      }
      setCurrentPage(page);
      const progress = Math.min(
        1,
        Math.max(0, scrollTop / Math.max(1, el.scrollHeight - el.clientHeight))
      );
      setReading({ visiblePage: page, totalPages: numPages, scrollProgress: progress });
    });
  }, [numPages, pageOffsets, setReading]);

  const onDocumentLoadSuccess = useCallback(
    (pdf: PDFDocumentProxy) => {
      pdfDocRef.current = pdf;
      setNumPages(pdf.numPages);
      setReading({ totalPages: pdf.numPages, visiblePage: 1, scrollProgress: 0 });
    },
    [setReading]
  );

  const resetForNewDoc = useCallback(
    (url: string, name: string) => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (url.startsWith("blob:")) blobUrlRef.current = url;
      textCacheRef.current = new Map();
      pdfDocRef.current = null;
      setPageHeights(new Map());
      setNumPages(0);
      setCurrentPage(1);
      setLoadError(null);
      setFileUrl(url);
      setFileName(name);
      interpretStartedRef.current = false;
      setDocument(name);
      loadCuesFor(name);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    },
    [setDocument, loadCuesFor]
  );

  const handleLocalFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      resetForNewDoc(URL.createObjectURL(file), file.name);
      event.target.value = "";
    },
    [resetForNewDoc]
  );

  // Tutor context: text of the page at the reading line.
  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (numPages === 0 || !pdf) return;
    const cached = textCacheRef.current.get(currentPage);
    if (cached !== undefined) {
      setActiveDocumentContext(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (currentPage > pdf.numPages) return;
        const page = await pdf.getPage(currentPage);
        const tc = await page.getTextContent();
        if (cancelled) return;
        const text = extractPageText(tc.items as Array<Record<string, unknown>>);
        textCacheRef.current.set(currentPage, text);
        setActiveDocumentContext(text);
      } catch {
        // best-effort; the tutor still works with cue metadata
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPage, numPages, setActiveDocumentContext]);

  // Background queue: extract every page once, pin keyword cues to pages,
  // and for unknown papers ask the AI to map the document to demo cues.
  // Phase A extracts the first pages and starts interpretation immediately;
  // phase B extracts the rest (keyword pinning only), so big PDFs don't stall.
  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (numPages === 0 || !pdf || !fileUrl) return;
    let cancelled = false;

    const extractPage = async (p: number) => {
      if (textCacheRef.current.has(p)) return;
      try {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        if (cancelled) return;
        const text = extractPageText(tc.items as Array<Record<string, unknown>>);
        textCacheRef.current.set(p, text);
        const lower = text.toLowerCase();
        const storeCues = usePhysicsStore.getState().cues;
        for (const cue of storeCues) {
          if (cue.pinnedPage === null && cue.at.keywords?.some((kw) => matchesKeyword(lower, kw))) {
            usePhysicsStore.getState().pinCue(cue.id, p);
            break;
          }
        }
      } catch {
        // skip unreadable pages
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    (async () => {
      const firstPassEnd = Math.min(pdf.numPages, INTERPRET_PAGE_CAP);
      for (let p = 1; p <= firstPassEnd; p++) {
        if (cancelled) return;
        await extractPage(p);
      }
      if (cancelled) return;
      const store = usePhysicsStore.getState();
      if (store.interpretStatus === "pending" && !interpretStartedRef.current) {
        interpretStartedRef.current = true;
        const pages: { page: number; text: string }[] = [];
        for (let p = 1; p <= pdf.numPages && pages.length < INTERPRET_PAGE_CAP; p++) {
          const text = textCacheRef.current.get(p);
          if (text) pages.push({ page: p, text: text.slice(0, INTERPRET_TEXT_CAP) });
        }
        const applyFallback = async (message: string) => {
          usePhysicsStore.getState().loadAuthoredCues(fallbackCueMap().cues);
          await pinKeywordCues(pdf, textCacheRef.current, () => cancelled);
          usePhysicsStore.getState().setInterpretError(message);
        };
        if (pages.length === 0) {
          await applyFallback("No text could be extracted from this PDF");
        } else {
          const setProgress = usePhysicsStore.getState().setInterpretProgress;
          await interpretDocumentStream(fileName ?? "document.pdf", pages, {
            onProgress: (phase, done, total) => {
              if (cancelled) return;
              if (phase === "analyzing") setProgress(`AI is analyzing concepts (${done}/${total})…`);
              else if (phase === "designing") setProgress("AI is designing demo points…");
              else setProgress("AI is reading the paper…");
            },
            onFinal: async (cues) => {
              if (cancelled) return;
              if (cues.length === 0) {
                await applyFallback("The AI found no simulatable concepts — using default demo points");
                return;
              }
              usePhysicsStore.getState().loadLlmCues(cues);
            },
            onError: async (message) => {
              if (cancelled) return;
              await applyFallback(`AI interpretation failed (${message}) — using default demo points`);
            },
          });
        }
      }
      for (let p = firstPassEnd + 1; p <= pdf.numPages; p++) {
        if (cancelled) return;
        await extractPage(p);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [numPages, fileUrl, fileName]);

  // Smooth-scroll to a requested cue/page (J/K, cue marks, prev/next).
  // Guarded by nonce so re-measured page heights never re-trigger an old request.
  useEffect(() => {
    if (!scrollToPage) return;
    if (scrollToPage.nonce === lastScrollNonceRef.current) return;
    lastScrollNonceRef.current = scrollToPage.nonce;
    const el = scrollRef.current;
    if (!el) return;
    const offsets = pageOffsetsRef.current;
    const top = offsets[Math.max(0, scrollToPage.page - 1)] ?? 0;
    el.scrollTo({ top: top + 2, behavior: "smooth" });
  }, [scrollToPage]);

  useEffect(() => {
    pageOffsetsRef.current = pageOffsets;
  }, [pageOffsets]);

  // Keyboard: J/K to jump between demo points.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(input|select|textarea)$/i.test(target.tagName)) return;
      if (event.key === "j") jumpToCue(1);
      else if (event.key === "k") jumpToCue(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jumpToCue]);

  const recordPageHeight = useCallback((page: number, height: number) => {
    setPageHeights((prev) => {
      if (prev.get(page) === height) return prev;
      const next = new Map(prev);
      next.set(page, height);
      return next;
    });
  }, []);

  const sliceRange = useMemo(() => {
    if (numPages === 0) return { start: 1, end: 0 };
    return {
      start: Math.max(1, currentPage - SLICE_BEHIND),
      end: Math.min(numPages, currentPage + SLICE_AHEAD),
    };
  }, [currentPage, numPages]);

  const windowPages = useMemo(() => {
    const pages: number[] = [];
    const { start, end } = sliceRange;
    for (let p = start; p <= end; p++) pages.push(p);
    return pages;
  }, [sliceRange]);

  const keptPages = useMemo(() => {
    const kept = new Set<number>(windowPages);
    for (const [page] of pageHeights) {
      if (Math.abs(page - currentPage) <= KEEP_WINDOW) kept.add(page);
    }
    return kept;
  }, [windowPages, pageHeights, currentPage]);

  const marksPerPage = useMemo(() => {
    const map = new Map<number, { index: number; title: string; note: string }[]>();
    cues.forEach((cue, index) => {
      if (cue.pinnedPage === null) return;
      const list = map.get(cue.pinnedPage) ?? [];
      list.push({ index, title: cue.title, note: cue.note });
      map.set(cue.pinnedPage, list);
    });
    return map;
  }, [cues]);

  const options = useMemo(
    () => ({
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cMaps/`,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    }),
    []
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule)] px-3 py-1.5">
        {documents.length > 0 && (
          <select
            defaultValue=""
            onChange={(event) => {
              const doc = documents.find((d) => d.filename === event.target.value);
              if (doc) resetForNewDoc(documentFileUrl(doc.filename), doc.filename);
            }}
          >
            <option value="" disabled>
              Load from backend…
            </option>
            {documents.map((doc) => (
              <option key={doc.filename} value={doc.filename}>
                {doc.filename}
              </option>
            ))}
          </select>
        )}
        <label
          className="cursor-pointer select-none rounded-[3px] border border-[var(--ink)] px-2 py-[2px] text-[12px] hover:bg-[#f2f2f2]"
          title="Open a local PDF"
        >
          Open PDF…
          <input type="file" accept="application/pdf" className="hidden" onChange={handleLocalFile} />
        </label>
        <span className="muted tabular ml-auto text-[11px]">
          {interpretLabel && (
            <span className={interpretStatus === "error" ? "text-[#8a4a2a]" : ""}>
              {interpretLabel}
              {" · "}
            </span>
          )}
          {fileName ? (numPages ? `p. ${currentPage} / ${numPages}` : "loading…") : "no document"}
        </span>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="reader-pane min-h-0 flex-1">
        <div className="read-line" />
        <div className="reader-column">
          {fileUrl ? (
            <Document
              file={fileUrl}
              options={options}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(error) => setLoadError(String(error))}
              error={<p style={{ padding: 24, textAlign: "center" }}>Failed to load PDF.</p>}
            >
              {sliceRange.start > 1 && (
                <div style={{ height: pageOffsets[sliceRange.start - 1] }} aria-hidden />
              )}
              {windowPages.map((page) => {
                const isRendered = keptPages.has(page);
                const height = pageOffsets[page] - pageOffsets[page - 1] - PAGE_GAP;
                const marks = marksPerPage.get(page) ?? [];
                return (
                  <div key={page} className="pdf-page" style={{ height: isRendered ? undefined : height }}>
                    <span className="page-label">p. {page}</span>
                    {marks.map((mark, markIdx) => (
                      <button
                        key={mark.index}
                        className={`cue-mark ${mark.index === activeCueIndex ? "active" : ""}`}
                        style={{ top: `${10 + markIdx * 20}px` }}
                        onClick={() => requestScrollToPage(page)}
                        aria-label={`Jump to demo point: ${mark.title}`}
                      >
                        <span className="diamond" />
                        <span className="tip">
                          {mark.title} — {mark.note}
                        </span>
                      </button>
                    ))}
                    {isRendered ? (
                      <div className="mx-auto w-full">
                        <Page
                          pageNumber={page}
                          width={containerWidth || undefined}
                          onLoadSuccess={(proxy: PDFPageProxy) => {
                            const [x1, y1, x2, y2] = proxy.view;
                            const w = x2 - x1;
                            const h = y2 - y1;
                            setPageAspect((prev) =>
                              w > 0 && Math.abs(prev - h / w) > 1e-3 ? h / w : prev
                            );
                            recordPageHeight(page, containerWidth > 0 ? (h * containerWidth) / w : h);
                          }}
                          renderAnnotationLayer={false}
                          renderTextLayer={false}
                        />
                      </div>
                    ) : (
                      <div className="pdf-page-placeholder h-full w-full" />
                    )}
                  </div>
                );
              })}
              {sliceRange.end < numPages && (
                <div
                  style={{ height: pageOffsets[numPages] - pageOffsets[sliceRange.end] }}
                  aria-hidden
                />
              )}
            </Document>
          ) : (
            <div className="app-card mx-auto mt-10 max-w-md p-6">
              <h2 className="serif mb-2 text-lg font-semibold">No PDF loaded</h2>
              <p className="muted mb-3 text-[13px] leading-relaxed">
                Drop a lecture PDF into{" "}
                <code className="rounded-[3px] border border-[var(--rule)] px-1">content/lectures/</code>{" "}
                (served by the backend) or open one from your computer. The demo follows the text as
                you read.
              </p>
              <label className="inline-block cursor-pointer select-none rounded-[3px] border border-[var(--ink)] px-3 py-1 hover:bg-[#f2f2f2]">
                Open PDF…
                <input type="file" accept="application/pdf" className="hidden" onChange={handleLocalFile} />
              </label>
            </div>
          )}
          {loadError && <p className="mt-4 text-center text-[11px] text-red-700">{loadError}</p>}
        </div>
      </div>
    </div>
  );
}
