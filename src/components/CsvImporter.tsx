import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { Upload, FileText, X, AlertCircle, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnMapper, mapCsvRows } from "@/components/ColumnMapper";
import type { CsvRow, ColumnMapping, MappedTransaction } from "@/components/ColumnMapper";
import api from "@/api";
import { extractTextFromPDF } from "@/utils/pdfExtractor";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// AI-powered statement parser — calls the parse-statement Edge Function
// ---------------------------------------------------------------------------
interface AiTransaction {
  date:        string;
  description: string;
  amount:      number;
  type:        "expense" | "income";
  category:    string;
}

async function parseStatementWithAI(text: string): Promise<AiTransaction[]> {
  const { data, error } = await supabase.functions.invoke("parse-statement", {
    body: { text },
  });
  if (error) {
    // error.context may be a Response, a plain object, or a string depending on the Supabase client version
    let detail = error.message ?? "AI parsing failed";
    try {
      const ctx = (error as any).context;
      if (ctx) {
        if (typeof ctx.text === "function") {
          detail = await ctx.text();           // Response object
        } else if (typeof ctx === "string") {
          detail = ctx;                        // plain string
        } else {
          detail = JSON.stringify(ctx);        // plain object
        }
      }
    } catch { /* ignore secondary read errors */ }
    console.error("[parse-statement] Edge Function error:", detail);
    throw new Error(detail);
  }
  if (!Array.isArray(data)) throw new Error("AI returned unexpected response");
  return data as AiTransaction[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportResult {
  imported:   number;
  duplicates: number;
  skipped:    number;
  errors:     string[];
}

interface CsvImporterProps {
  /** Called after a successful import with the server summary */
  onComplete?: (result: { inserted: number; duplicates: number }) => void;
  /** Called when the user dismisses the importer */
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CsvImporter({ onComplete, onClose }: CsvImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [rawCsvData, setRawCsvData] = useState<CsvRow[]>([]);
  const [headers,    setHeaders]    = useState<string[]>([]);
  const [fileName,   setFileName]   = useState<string | null>(null);
  const [dragging,   setDragging]   = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing,  setImporting]  = useState(false);
  const [parsingPdf,    setParsingPdf]    = useState(false);
  const [result,        setResult]        = useState<ImportResult | null>(null);
  const [pdfPassword,   setPdfPassword]   = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pendingFile,   setPendingFile]   = useState<File | null>(null);

  // Step: "drop" | "map" | "result"
  const [step, setStep]           = useState<"drop" | "map" | "result">("drop");

  // ── File parsing ───────────────────────────────────────────────────────────
  const handleFileUpload = useCallback((file: File) => {
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    const isCsv = file.name.toLowerCase().endsWith(".csv");

    if (!isPdf && !isCsv) {
      setParseError("Please upload a .csv or .pdf file.");
      return;
    }

    setParseError(null);
    setResult(null);
    setRawCsvData([]);
    setFileName(file.name);

    if (isCsv) {
      Papa.parse<CsvRow>(file, {
        header:         true,
        skipEmptyLines: true,
        dynamicTyping:  false,
        complete: ({ data, meta, errors }) => {
          if (errors.length > 0) {
            setParseError(`CSV parse warning: ${errors[0].message}`);
          }
          setHeaders(meta.fields ?? []);
          setRawCsvData(data);
          setStep("map");
        },
      });
      return;
    }

    // ── PDF path ─────────────────────────────────────────────────────────────
    setParsingPdf(true);
    setStep("map");
    setPendingFile(file);
    setNeedsPassword(false);

    (async () => {
      try {
        const extractedText  = await extractTextFromPDF(file);
        const transactions   = await parseStatementWithAI(extractedText);

        if (transactions.length === 0) {
          setParseError("No transaction rows could be extracted from this PDF.");
          setStep("drop");
          setParsingPdf(false);
          return;
        }

        const headers = ["date", "description", "amount", "type", "category"];
        const rows = transactions.map(t => ({
          date:        t.date,
          description: t.description,
          amount:      String(t.amount),
          type:        t.type,
          category:    t.category,
        }));

        setHeaders(headers);
        setRawCsvData(rows);
        setParsingPdf(false);
      } catch (error) {
        // ── Encrypted PDF — prompt the user for a password ──────────────────
        if (error === 'ENCRYPTED_PDF') {
          setNeedsPassword(true);
          setStep("drop");
          setParsingPdf(false);
          return;
        }
        const msg = error instanceof Error ? error.message : "Failed to parse PDF. Try a CSV export from your bank instead.";
        setParseError(msg);
        setStep("drop");
        setParsingPdf(false);
      }
    })();
  }, []);

  // Drag-and-drop handlers
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // ── Import — called by ColumnMapper once the user confirms the mapping ──────
  const handleConfirm = async (
    _mappedRows: MappedTransaction[],  // pre-mapped rows from ColumnMapper (unused; we re-run with full data)
    mapping: ColumnMapping,
  ) => {
    // ── Step A: Transform raw CSV → clean rows ──────────────────────────────
    const { rows: allRows, skipped } = mapCsvRows(rawCsvData, mapping);
    const errors = skipped.map((s) => `Row ${s.rowNum}: ${s.reason}`);

    if (allRows.length === 0) {
      setResult({ imported: 0, duplicates: 0, skipped: skipped.length, errors });
      setStep("result");
      return;
    }

    // ── Step B: AI categorization happens server-side inside POST /import ──
    // The backend calls categorizeBatch() before writing to MongoDB, so the
    // frontend sends raw "Uncategorized" values and gets back AI-labelled rows
    // in the Review Queue — no extra round-trip needed here.

    setImporting(true);

    // Each row includes bankReferenceId for server-side dedup + needsReview flag
    const txRows = allRows.map((r) => ({
      type:            r.type,
      amount:          r.amount,
      category:        r.category,
      description:     r.description,
      date:            r.date,
      bankReferenceId: r.bankReferenceId,
      needsReview:     true,
    }));

    const importResult: ImportResult = {
      imported:   0,
      duplicates: 0,
      skipped:    skipped.length,
      errors,
    };

    try {
      const { data } = await api.post<{ inserted: number; duplicates: number; total: number }>(
        "/transactions/import",
        { transactions: txRows },
        { timeout: 100_000 }   // batch AI categorization can take up to ~60 s on cold Render instances
      );
      importResult.imported   = data.inserted;
      importResult.duplicates = data.duplicates;
      onComplete?.({ inserted: data.inserted, duplicates: data.duplicates });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Some rows failed to save — check the console for details.";
      importResult.errors.push(msg);
    } finally {
      setResult(importResult);
      setImporting(false);
      setStep("result");
    }
  };

  // ── Re-parse with a password after the user submits it ───────────────────
  const handlePasswordSubmit = async () => {
    if (!pendingFile || !pdfPassword) return;
    setNeedsPassword(false);
    setParsingPdf(true);
    setStep("map");

    try {
      const extractedText  = await extractTextFromPDF(pendingFile, pdfPassword);
      const transactions   = await parseStatementWithAI(extractedText);

      if (transactions.length === 0) {
        setParseError("No transaction rows could be extracted from this PDF.");
        setStep("drop");
        setParsingPdf(false);
        return;
      }

      const hdrs = ["date", "description", "amount", "type", "category"];
      const rows = transactions.map(t => ({
        date:        t.date,
        description: t.description,
        amount:      String(t.amount),
        type:        t.type,
        category:    t.category,
      }));

      setHeaders(hdrs);
      setRawCsvData(rows);
      setFileName(pendingFile.name);
      setParsingPdf(false);
    } catch (error) {
      if (error === 'ENCRYPTED_PDF') {
        // Wrong password — let user try again
        setParseError("Incorrect password. Please try again.");
        setNeedsPassword(true);
        setPdfPassword('');
      } else {
        setParseError(error instanceof Error ? error.message : "Failed to parse PDF.");
      }
      setStep("drop");
      setParsingPdf(false);
    }
  };

  const reset = () => {
    setRawCsvData([]);
    setHeaders([]);
    setFileName(null);
    setParseError(null);
    setResult(null);
    setParsingPdf(false);
    setNeedsPassword(false);
    setPdfPassword('');
    setPendingFile(null);
    setStep("drop");
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Step 1: Drop zone ──────────────────────────────────────────────── */}
      {step === "drop" && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors select-none
              ${dragging
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/30"
              }`}
          >
            <Upload className="h-8 w-8" />
            <div className="text-center">
              <p className="text-sm font-medium">
                {dragging ? "Drop your file here" : "Drag & drop a CSV or PDF, or click to browse"}
              </p>
              <p className="text-xs mt-1 opacity-70">
                CSV: first row must be a header row. PDF: bank statement direct from your bank portal.
              </p>
            </div>
            <input
              ref={fileInputRef}
              id="file-upload"
              name="file-upload"
              type="file"
              accept=".csv,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = "";
              }}
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-yellow-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {/* ── Password prompt for encrypted PDFs ───────────────────────── */}
          {needsPassword && (
            <div className="rounded-xl border backdrop-blur-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(124,58,237,0.20)' }}>
              <p className="flex items-center gap-2 text-slate-800 text-sm font-semibold">
                <Lock className="h-4 w-4 text-orange-500" />
                This PDF is password-protected
              </p>
              <p className="text-slate-500 text-xs">
                Enter the password used to open your bank statement.
              </p>
              <div className="flex gap-2">
                <Input
                  id="pdf-password"
                  name="pdf-password"
                  type="password"
                  placeholder="Bank statement password"
                  value={pdfPassword}
                  onChange={(e) => setPdfPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                  className="bg-white text-slate-800 border-slate-200 placeholder:text-slate-400 focus-visible:ring-violet-500/50"
                />
                <Button
                  onClick={handlePasswordSubmit}
                  disabled={!pdfPassword}
                  className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white border-0 shadow-lg shadow-violet-600/30"
                >
                  Submit &amp; Parse
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Step 2: Column mapping (delegated to ColumnMapper) ─────────────── */}
      {step === "map" && (
        <>
          {/* File badge with reset */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <FileText className="h-4 w-4 text-primary" />
              {fileName}
              <span className="text-muted-foreground font-normal">
                — {rawCsvData.length} rows detected
              </span>
            </span>
            <button onClick={reset} className="text-muted-foreground hover:text-destructive transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {importing || parsingPdf ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">
                {parsingPdf ? "Extracting & AI-parsing bank statement…" : "Categorizing and saving to database…"}
              </p>
            </div>
          ) : (
            <ColumnMapper
              headers={headers}
              rawCsvData={rawCsvData}
              fileName={fileName ?? ""}
              onConfirm={handleConfirm}
              onBack={reset}
            />
          )}
        </>
      )}

      {/* ── Step 3: Result summary ─────────────────────────────────────────── */}
      {step === "result" && result && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Import complete</p>
              <p className="text-xs mt-0.5">
                {result.imported} imported
                {result.duplicates > 0 && `, ${result.duplicates} duplicate${result.duplicates !== 1 ? "s" : ""} skipped`}
                {result.skipped > 0 && `, ${result.skipped} row${result.skipped !== 1 ? "s" : ""} had parse errors`}.
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-yellow-400">Skipped rows</p>
              <ul className="text-xs text-yellow-300/80 space-y-0.5 list-disc list-inside">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={reset}>Import another file</Button>
            {onClose && <Button onClick={onClose}>Done</Button>}
          </div>
        </div>
      )}

    </div>
  );
}
