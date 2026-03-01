// src/utils/pdfExtractor.ts
// Coordinate-Based Column Locking PDF extractor using pdfjs-dist.
//
// Architecture:
//   1. Y-Coordinate Grouping  → reconstruct each visual row from text fragments
//   2. X-Coordinate Bucketing → lock each fragment into a named column
//   3. Fixed 5-column output  → "date | narration | withdrawal | deposit | balance"
//      Empty numeric cells are always "0.00" — zero ambiguity for the Edge Function.

import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ---------------------------------------------------------------------------
// ⚙️  COLUMN THRESHOLDS (PDF point coordinates — adjust to your statement)
// ---------------------------------------------------------------------------
// Run a quick test-extract and log item.transform[4] values to calibrate.
// These defaults work for typical A4 portrait SBI / HDFC / ICICI statements.
const COL = {
  DATE_MAX:         60,   // X < DATE_MAX                   → date column
  NARRATION_MIN:    60,   // DATE_MAX  ≤ X < NARRATION_MAX  → narration
  NARRATION_MAX:   300,
  // Ref-No zone: 300–400 — intentionally skipped / ignored
  WITHDRAWAL_MIN:  400,   // WITHDRAWAL_MIN ≤ X < WITHDRAWAL_MAX
  WITHDRAWAL_MAX:  480,
  DEPOSIT_MIN:     480,   // DEPOSIT_MIN   ≤ X < DEPOSIT_MAX
  DEPOSIT_MAX:     550,
  BALANCE_MIN:     550,   // X ≥ BALANCE_MIN → balance column
} as const;

// Y-axis tolerance: items within ±Y_TOLERANCE px are treated as the same row
const Y_TOLERANCE = 2;

// ---------------------------------------------------------------------------
// Internal row type produced by the coordinate extractor
// ---------------------------------------------------------------------------
export interface ExtractedRow {
  date:       string;   // raw date token, e.g. "10/02/26"
  narration:  string;   // full narration text (may include ref no)
  withdrawal: number;   // 0 when cell is empty
  deposit:    number;   // 0 when cell is empty
  balance:    number;   // closing balance for this row
}

// ---------------------------------------------------------------------------
// extractTextFromPDF
//   Returns a fixed 5-column pipe-delimited string suitable for the Edge Function.
//   Format per row:  "date | narration | withdrawal | deposit | balance"
//   Numeric columns always carry a value — "0.00" when the cell is empty.
// ---------------------------------------------------------------------------
export async function extractTextFromPDF(file: File, password?: string): Promise<string> {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, password });
    let pdf: pdfjsLib.PDFDocumentProxy;
    try {
      pdf = await loadingTask.promise;
    } catch (error: any) {
      if (error?.name === 'PasswordException') throw 'ENCRYPTED_PDF';
      throw error;
    }

    const allRows: ExtractedRow[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page        = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // ── Step 1: Y-Coordinate Grouping ─────────────────────────────────────
      // Group text items into row buckets by snapping Y to the nearest even
      // multiple of Y_TOLERANCE so items within ±Y_TOLERANCE land in the same bucket.
      const rowMap = new Map<number, Array<{ x: number; str: string }>>();

      for (const item of textContent.items as any[]) {
        const str: string = (item.str ?? '').trim();
        if (!str) continue;

        const rawY: number = item.transform?.[5] ?? 0;
        const rawX: number = item.transform?.[4] ?? 0;

        // Snap Y to nearest multiple of (2 × Y_TOLERANCE)
        const bucketY = Math.round(rawY / (2 * Y_TOLERANCE)) * (2 * Y_TOLERANCE);

        if (!rowMap.has(bucketY)) rowMap.set(bucketY, []);
        rowMap.get(bucketY)!.push({ x: rawX, str });
      }

      // Sort rows top-to-bottom (PDF Y increases upward, so higher Y = higher on page)
      const sortedYKeys = [...rowMap.keys()].sort((a, b) => b - a);

      for (const y of sortedYKeys) {
        const items = rowMap.get(y)!.sort((a, b) => a.x - b.x);

        // ── Step 2: X-Coordinate Column Bucketing ────────────────────────────
        const bucket = {
          date:       [] as string[],
          narration:  [] as string[],
          withdrawal: [] as string[],
          deposit:    [] as string[],
          balance:    [] as string[],
        };

        for (const { x, str } of items) {
          if (x < COL.DATE_MAX) {
            bucket.date.push(str);
          } else if (x >= COL.NARRATION_MIN && x < COL.NARRATION_MAX) {
            bucket.narration.push(str);
          } else if (x >= COL.WITHDRAWAL_MIN && x < COL.WITHDRAWAL_MAX) {
            bucket.withdrawal.push(str);
          } else if (x >= COL.DEPOSIT_MIN && x < COL.DEPOSIT_MAX) {
            bucket.deposit.push(str);
          } else if (x >= COL.BALANCE_MIN) {
            bucket.balance.push(str);
          }
          // Items in the Ref-No zone (300–400) are intentionally dropped
        }

        // ── Step 3: Safe Number Extraction ───────────────────────────────────
        const parseCol = (parts: string[]): number => {
          if (parts.length === 0) return 0;
          const cleaned = parts.join('').replace(/,/g, '').trim();
          const n = parseFloat(cleaned);
          return isFinite(n) && n > 0 ? n : 0;
        };

        const dateStr   = bucket.date.join(' ').trim();
        const narration = bucket.narration.join(' ').trim();
        const withdrawal = parseCol(bucket.withdrawal);
        const deposit    = parseCol(bucket.deposit);
        const balance    = parseCol(bucket.balance);

        // Only keep rows that look like data rows (have a date AND a balance)
        if (!dateStr || balance === 0) continue;

        allRows.push({ date: dateStr, narration, withdrawal, deposit, balance });
      }
    }

    if (allRows.length === 0) {
      throw new Error(
        'No transaction rows could be extracted. The PDF may be scanned/image-only, ' +
        'or the column X-coordinates may need recalibration in pdfExtractor.ts.'
      );
    }

    // ── Serialize to fixed 5-column pipe-delimited text ─────────────────────
    // Format: "date | narration | withdrawal | deposit | balance"
    // Numeric columns always present — "0.00" when the bank cell was empty.
    const lines = allRows.map(r =>
      [
        r.date,
        r.narration || 'Unknown',
        r.withdrawal.toFixed(2),
        r.deposit.toFixed(2),
        r.balance.toFixed(2),
      ].join(' | ')
    );

    return lines.join('\n');

  } catch (error) {
    if (error === 'ENCRYPTED_PDF') throw error;
    console.error('[pdfExtractor] Error:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Failed to extract text from PDF.'
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: read File → ArrayBuffer
// ---------------------------------------------------------------------------
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => {
      const result = e.target?.result;
      result instanceof ArrayBuffer
        ? resolve(result)
        : reject(new Error('Failed to read file as ArrayBuffer'));
    };
    reader.onerror = () => reject(new Error('FileReader error: ' + reader.error?.message));
    reader.readAsArrayBuffer(file);
  });
}

// ---------------------------------------------------------------------------
// parseTransactionsFromText — kept for backward compatibility (unused by AI flow)
// ---------------------------------------------------------------------------
export function parseTransactionsFromText(text: string): Array<{
  date: string; description: string; amount: string; type: string;
}> {
  const transactions: Array<{
    date: string; description: string; amount: string; type: string;
  }> = [];
  const datePattern   = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;
  const amountPattern = /[-+]?\$?\d+[,.]?\d*\.?\d+/;
  for (const line of text.split('\n')) {
    const dateMatch   = line.match(datePattern);
    const amountMatch = line.match(amountPattern);
    if (dateMatch && amountMatch) {
      const numericAmount = parseFloat(amountMatch[0].replace(/[$,]/g, ''));
      transactions.push({
        date:        dateMatch[1],
        description: line.replace(dateMatch[0], '').replace(amountMatch[0], '').trim(),
        amount:      Math.abs(numericAmount).toString(),
        type:        numericAmount < 0 ? 'expense' : 'income',
      });
    }
  }
  return transactions;
}