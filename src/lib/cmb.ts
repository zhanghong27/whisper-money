export interface CmbRecordRaw {
  记账日期: string;
  货币: string;
  交易金额: string; // may include sign
  联机余额: string;
  交易摘要: string;
  对手信息: string;
}

export interface CmbParseResult {
  header: string[];
  rows: string[][];
  records: CmbRecordRaw[];
}

const HEADER = [
  '记账日期',
  '货币',
  '交易金额',
  '联机余额',
  '交易摘要',
  '对手信息',
];

type PdfTextItem = { str: string; transform: number[] };

export async function parseCmbPdf(file: File): Promise<CmbParseResult> {
  // Load PDF.js and configure worker via CDN URL to satisfy environments
  // where bundling the worker is problematic under Vite.
  const pdfjsLib: any = await import('pdfjs-dist');
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  const items: PdfTextItem[] = (textContent.items as any[]).map((it) => ({
    str: String((it as any).str || ''),
    transform: (it as any).transform || [],
  }));

  // Collect positioned strings
  type Pt = { x: number; y: number; text: string };
  const pts: Pt[] = items.map((it) => ({
    x: Number(it.transform?.[4] || 0),
    y: Number(it.transform?.[5] || 0),
    text: it.str.trim(),
  })).filter((p) => p.text);

  // Find header x positions
  const colX: Record<string, number> = {} as any;
  for (const h of HEADER) {
    const hit = pts.find((p) => p.text === h);
    if (hit) colX[h] = hit.x;
  }
  // Fallback approximate positions if missing
  if (Object.keys(colX).length < HEADER.length) {
    colX['记账日期'] = colX['记账日期'] ?? 36;
    colX['货币'] = colX['货币'] ?? 98.74;
    colX['交易金额'] = colX['交易金额'] ?? 156.26;
    colX['联机余额'] = colX['联机余额'] ?? 234.71;
    colX['交易摘要'] = colX['交易摘要'] ?? 307.88;
    colX['对手信息'] = colX['对手信息'] ?? 417.64;
  }

  const colOrder = HEADER.map((h) => colX[h]);

  // Group by Y (rows). Use tolerance due to rendering variance.
  const groups = new Map<number, Pt[]>();
  const tol = 2.5;
  for (const p of pts) {
    // skip header labels
    if (HEADER.includes(p.text)) continue;
    // find existing group within tolerance
    let key: number | null = null;
    for (const k of groups.keys()) {
      if (Math.abs(k - p.y) <= tol) { key = k; break; }
    }
    const yKey = key ?? p.y;
    const arr = groups.get(yKey) || [];
    arr.push(p);
    groups.set(yKey, arr);
  }

  // Assign each row’s texts to nearest column
  const rows: string[][] = [];
  const yKeys = Array.from(groups.keys()).sort((a,b)=>b-a);
  for (const y of yKeys) {
    const cells = new Array(HEADER.length).fill('');
    const ps = groups.get(y)!.sort((a,b)=>a.x-b.x);
    for (const p of ps) {
      // map to nearest column
      let idx = 0, best = Infinity;
      for (let i=0;i<colOrder.length;i++) {
        const d = Math.abs(p.x - colOrder[i]);
        if (d < best) { best = d; idx = i; }
      }
      cells[idx] = (cells[idx] ? cells[idx] + ' ' : '') + p.text;
    }
    // keep rows with a date-like first cell
    if (/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) {
      rows.push(cells);
    }
  }

  const records: CmbRecordRaw[] = rows.map((r) => ({
    记账日期: r[0] || '',
    货币: r[1] || '',
    交易金额: r[2] || '',
    联机余额: r[3] || '',
    交易摘要: r[4] || '',
    对手信息: r[5] || '',
  }));

  return { header: HEADER, rows, records };
}

export function cmbAmountToNumber(s: string): number {
  // e.g. "-107.78" or "107.78"
  const n = Number((s || '').replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}
