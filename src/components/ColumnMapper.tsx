import { useState, useMemo } from "react";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types — exported so CsvImporter and other consumers can reuse them
// ---------------------------------------------------------------------------

/** One raw row from PapaParse: every value is still a string. */
export type CsvRow = Record<string, string>;

/**
 * The user's intent: which CSV column maps to each required DB field.
 * Names mirror the database fields they will ultimately be stored in.
 */
export interface ColumnMapping {
  dbDate:        string; // required — which CSV col holds the transaction date
  dbAmount:      string; // required — which CSV col holds the amount
  dbDescription: string; // required — which CSV col holds the description/narration
  dbType:        string; // optional — income/expense discriminator; inferred from sign if SKIP
  dbCategory:    string; // optional — spending category; defaults to "Uncategorized" if SKIP
  dbReference:   string; // optional — bank-supplied reference/ID for dedup; auto-generated if SKIP
}

/** A fully normalised transaction row ready to send to the backend. */
export interface MappedTransaction {
  date:             string;            // YYYY-MM-DD
  amount:           number;            // always positive
  description:      string;
  type:             "income" | "expense";
  category:         string;
  bankReferenceId:  string;            // stable dedup key — from CSV column or auto-generated
}

// ── Sentinel for "don't use this column" ────────────────────────────────────
export const SKIP = "__skip__";

// ── Field descriptors ───────────────────────────────────────────────────────
interface FieldDef {
  key:         keyof ColumnMapping;
  label:       string;
  required:    boolean;
  hint:        string;
  autoMatch:   string[]; // substrings to fuzzy-match against header names
}

const FIELD_DEFS: FieldDef[] = [
  {
    key: "dbDate",
    label: "Date",
    required: true,
    hint: "The column that contains the transaction date.",
    autoMatch: ["date", "posted", "time", "when"],
  },
  {
    key: "dbAmount",
    label: "Amount",
    required: true,
    hint: "The numeric amount — positive for income, negative for expenses.",
    autoMatch: ["amount", "sum", "value", "debit", "credit"],
  },
  {
    key: "dbDescription",
    label: "Description",
    required: true,
    hint: "The transaction narrative, memo, or merchant name.",
    autoMatch: ["desc", "narr", "memo", "note", "detail", "particular", "merchant", "payee"],
  },
  {
    key: "dbType",
    label: "Type (income / expense)",
    required: false,
    hint: "Optional. If missing, the sign of the amount column is used.",
    autoMatch: ["type", "cr/dr", "dr/cr", "debit", "credit"],
  },
  {
    key: "dbCategory",
    label: "Category",
    required: false,
    hint: "Optional. Defaults to 'Uncategorized' if not present in your CSV.",
    autoMatch: ["categ", "tag", "label", "class"],
  },
  {
    key: "dbReference",
    label: "Bank Reference / ID",
    required: false,
    hint: "Optional but recommended. A unique ID from your bank (e.g. transaction ID, reference number) used to prevent duplicate imports.",
    autoMatch: ["ref", "txn id", "transaction id", "tran id", "id", "reference", "unique"],
  },
];

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

export function normaliseDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // Parts separated by / or -
  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // YYYY first → already handled above, but catch YYYY/MM/DD
    if (a.length === 4) {
      const d = new Date(`${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    // c is year (MM/DD/YYYY or DD/MM/YYYY) — try MM/DD first
    if (c.length === 4) {
      const d = new Date(`${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function normaliseType(raw: string, amount: number): "income" | "expense" {
  const v = raw?.trim().toLowerCase() ?? "";
  if (["income", "credit", "deposit", "cr"].includes(v)) return "income";
  if (["expense", "debit", "withdrawal", "dr", "payment"].includes(v)) return "expense";
  return amount >= 0 ? "income" : "expense";
}

// ---------------------------------------------------------------------------
// Transformation function
// Accepts rawCsvData + the user's ColumnMapping and produces clean rows.
// Returns { rows, errors } — errors are per-row human-readable strings.
// ---------------------------------------------------------------------------
export function mapCsvRows(
  rawCsvData: CsvRow[],
  mapping: ColumnMapping,
): { rows: MappedTransaction[]; skipped: { rowNum: number; reason: string }[] } {
  const rows: MappedTransaction[] = [];
  const skipped: { rowNum: number; reason: string }[] = [];
  // Tracks how many times each content-key has appeared so far in this batch.
  // Appending the count to the auto-generated bankReferenceId ensures two
  // transactions with identical (date, amount, description) — which are valid!
  // — never collapse into the same dedup key.
  const contentKeyCount = new Map<string, number>();

  rawCsvData.forEach((raw, idx) => {
    const rowNum = idx + 2; // +1 for 0-index, +1 for header row

    // ── Required: date ──────────────────────────────────────────────────────
    const rawDate = raw[mapping.dbDate]?.trim() ?? "";
    const date = normaliseDate(rawDate);
    if (!date) {
      skipped.push({ rowNum, reason: `Invalid date "${rawDate}"` });
      return;
    }

    // ── Required: amount ────────────────────────────────────────────────────
    const rawAmount = raw[mapping.dbAmount]?.trim() ?? "";
    const amount = parseFloat(rawAmount.replace(/[,$\s]/g, ""));
    if (isNaN(amount)) {
      skipped.push({ rowNum, reason: `Invalid amount "${rawAmount}"` });
      return;
    }

    // ── Required: description ───────────────────────────────────────────────
    const description = raw[mapping.dbDescription]?.trim() || "Imported transaction";

    // ── Optional: type ──────────────────────────────────────────────────────
    const rawType = mapping.dbType !== SKIP ? (raw[mapping.dbType]?.trim() ?? "") : "";
    const type = normaliseType(rawType, amount);

    // ── Optional: category ──────────────────────────────────────────────────
    const rawCat = mapping.dbCategory !== SKIP ? (raw[mapping.dbCategory]?.trim() ?? "") : "";
    const KNOWN = [
      "Uncategorized","Salary","Freelance","Rent","Groceries","Utilities",
      "Transport","Entertainment","Health","Education","Shopping","Food",
      "Subscriptions","Insurance","Savings","Investment","Other",
    ];
    const category = KNOWN.includes(rawCat) ? rawCat : "Uncategorized";

    // ── Optional: bankReferenceId ───────────────────────────────────────────
    // Use the mapped column if available. Otherwise generate a deterministic
    // content key. The key gets a per-content occurrence counter appended so
    // that two legitimately identical transactions on the same day (e.g. two
    // ₹2000 UPI payments) are never collapsed into a single dedup key.
    // Re-uploading the exact same file still produces the same IDs because the
    // row order and occurrence counts are stable across uploads.
    const mappedRef =
      mapping.dbReference !== SKIP ? raw[mapping.dbReference]?.trim() : "";
    const contentKey = `${date}|${Math.abs(amount).toFixed(2)}|${description.slice(0, 40).replace(/\|/g, " ")}`;
    const occurrence = (contentKeyCount.get(contentKey) ?? 0) + 1;
    contentKeyCount.set(contentKey, occurrence);
    const bankReferenceId = mappedRef
      ? mappedRef
      : `${contentKey}|${occurrence}`;

    rows.push({ date, amount: Math.abs(amount), description, type, category, bankReferenceId });
  });

  return { rows, skipped };
}

// ---------------------------------------------------------------------------
// Auto-detect initial mapping from header names
// ---------------------------------------------------------------------------
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const guess = (candidates: string[]) =>
    headers.find((h) =>
      candidates.some((c) => h.toLowerCase().includes(c))
    ) ?? SKIP;

  return {
    dbDate:        guess(FIELD_DEFS.find((f) => f.key === "dbDate")!.autoMatch),
    dbAmount:      guess(FIELD_DEFS.find((f) => f.key === "dbAmount")!.autoMatch),
    dbDescription: guess(FIELD_DEFS.find((f) => f.key === "dbDescription")!.autoMatch),
    dbType:        guess(FIELD_DEFS.find((f) => f.key === "dbType")!.autoMatch),
    dbCategory:    guess(FIELD_DEFS.find((f) => f.key === "dbCategory")!.autoMatch),
    dbReference:   guess(FIELD_DEFS.find((f) => f.key === "dbReference")!.autoMatch),
  };
}

// ---------------------------------------------------------------------------
// ColumnMapper UI component
// ---------------------------------------------------------------------------
interface ColumnMapperProps {
  headers:    string[];          // extracted from PapaParse meta.fields
  rawCsvData: CsvRow[];          // full parsed rows (strings only)
  fileName:   string;
  /** Called when the user confirms mappings and transformation succeeds */
  onConfirm:  (rows: MappedTransaction[], mapping: ColumnMapping) => void;
  /** Called to go back to the drop zone */
  onBack?:    () => void;
}

export function ColumnMapper({
  headers,
  rawCsvData,
  fileName,
  onConfirm,
  onBack,
}: ColumnMapperProps) {
  // ── Mapping state — seeded via auto-detection ────────────────────────────
  const [mapping, setMapping] = useState<ColumnMapping>(
    () => autoDetectMapping(headers)
  );

  const set = (field: keyof ColumnMapping, value: string) =>
    setMapping((m) => ({ ...m, [field]: value }));

  // ── Validation: all required fields must be mapped ───────────────────────
  const canConfirm =
    mapping.dbDate        !== SKIP &&
    mapping.dbAmount      !== SKIP &&
    mapping.dbDescription !== SKIP;

  // ── Live preview: transform first 3 rows with current mapping ────────────
  const preview = useMemo(() => {
    if (!canConfirm) return { rows: [], skipped: [] };
    const sample = rawCsvData.slice(0, 3);
    return mapCsvRows(sample, mapping);
  }, [mapping, rawCsvData, canConfirm]);

  // ── Confirm: transform all rows and call parent ──────────────────────────
  const handleConfirm = () => {
    const { rows } = mapCsvRows(rawCsvData, mapping);
    onConfirm(rows, mapping);
  };

  return (
    <div className="space-y-5">
      {/* File info */}
      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{fileName}</span>
        {" — "}{rawCsvData.length} rows, {headers.length} columns detected.
      </div>

      {/* ── Column mapping dropdowns ── */}
      <div>
        <p className="text-sm font-semibold mb-3">Map columns to database fields</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELD_DEFS.map(({ key, label, required, hint }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">
                  {label}
                  {required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <span title={hint} className="text-muted-foreground cursor-help">
                  <Info className="h-3 w-3" />
                </span>
              </div>

              <Select
                value={mapping[key]}
                onValueChange={(v) => set(key, v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select column…" />
                </SelectTrigger>
                <SelectContent>
                  {!required && (
                    <SelectItem value={SKIP}>
                      <span className="text-muted-foreground italic">— skip —</span>
                    </SelectItem>
                  )}
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Fields marked <span className="text-destructive">*</span> are required.
          Optional fields default gracefully if skipped.
        </p>
      </div>

      {/* ── Live preview ── */}
      {canConfirm && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Preview — first {Math.min(3, rawCsvData.length)} rows after transformation
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["date","description","amount","type","category"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold capitalize whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t border-border even:bg-muted/20">
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{row.date}</td>
                    <td className="px-3 py-1.5 max-w-[180px] truncate text-muted-foreground">{row.description}</td>
                    <td className="px-3 py-1.5 font-mono whitespace-nowrap text-muted-foreground">{row.amount.toFixed(2)}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap font-medium ${row.type === "income" ? "income-text" : "expense-text"}`}>
                      {row.type}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{row.category}</td>
                  </tr>
                ))}
                {preview.skipped.length > 0 && (
                  <tr className="border-t border-border bg-yellow-400/5">
                    <td colSpan={5} className="px-3 py-1.5 text-yellow-400 text-xs">
                      {preview.skipped.length} preview row(s) skipped — check your column mapping.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center justify-between pt-1">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Back
          </Button>
        ) : <div />}

        <Button onClick={handleConfirm} disabled={!canConfirm}>
          Confirm mapping
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {!canConfirm && (
        <p className="text-xs text-muted-foreground text-right">
          Map all required (*) columns to continue.
        </p>
      )}
    </div>
  );
}
