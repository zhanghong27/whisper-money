export interface BocRecordRaw {
  日期: string;
  币种?: string;
  借方金额?: string; // 支出
  贷方金额?: string; // 收入
  金额?: string;      // 当存在“金额/收支”格式
  余额?: string;
  摘要?: string;
  对方信息?: string;
}

export interface BocParseResult {
  header: string[];   // 实际检测到并输出的列顺序
  rows: string[][];
  records: BocRecordRaw[];
}

const HEADER_CANDIDATES = [
  '交易日期','记账日期','日期',
  '币种','币别','币种名称',
  '借方金额','借方发生额','支出',
  '贷方金额','贷方发生额','收入',
  '金额',
  '余额','可用余额','当前余额',
  '摘要','交易摘要','附言',
  '对方信息','对方户名','对方名称','交易对手'
];

type PdfTextItem = { str: string; transform: number[] };

export async function parseBocPdf(file: File, password?: string): Promise<BocParseResult> {
  // Use PDF.js without a web worker to avoid worker path/network issues
  const pdfjsLib: any = await import('pdfjs-dist');
  if (pdfjsLib?.GlobalWorkerOptions) {
    // Set a worker URL to avoid runtime checks throwing errors
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  const data = await file.arrayBuffer();
  const loading = pdfjsLib.getDocument({ data, password, disableWorker: true });
  const pdf = await loading.promise;

  type Pt = { x: number; y: number; text: string };
  const pts: Pt[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const text = await page.getTextContent();
    const items: PdfTextItem[] = (text.items as any[]).map((it) => ({
      str: String((it as any).str || ''),
      transform: (it as any).transform || [],
    }));
    for (const it of items) {
      const s = it.str.trim();
      if (!s) continue;
      const x = Number(it.transform?.[4] || 0);
      const y = Number(it.transform?.[5] || 0);
      pts.push({ x, y, text: s });
    }
  }

  // Find present header labels and their x positions
  const present: Record<string, number> = {};
  for (const h of HEADER_CANDIDATES) {
    const hit = pts.find((p) => p.text === h);
    if (hit) present[h] = hit.x;
  }

  // Choose normalized header order to output
  const order: { label: string; x: number }[] = [];
  function pick(...names: string[]) {
    for (const n of names) if (present[n] !== undefined) return { label: n, x: present[n]! };
    return null;
  }
  const hDate = pick('交易日期','记账日期','日期');
  const hCcy  = pick('币种','币别','币种名称');
  const hDebit = pick('借方金额','借方发生额','支出');
  const hCredit= pick('贷方金额','贷方发生额','收入');
  const hAmt = pick('金额');
  const hBal = pick('余额','可用余额','当前余额');
  const hMemo= pick('摘要','交易摘要','附言');
  const hPeer= pick('对方信息','对方户名','对方名称','交易对手');

  const cols = [hDate, hCcy, hDebit, hCredit, hAmt, hBal, hMemo, hPeer].filter(Boolean) as {label:string;x:number}[];
  if (!hDate) throw new Error('未找到表头：缺少“日期/记账日期/交易日期”');
  if (cols.length === 0) throw new Error('未检测到有效表头');

  const header = cols.map(c => c.label);
  const colXs = cols.map(c => c.x);

  // Group by Y within tolerance, assign to nearest X
  const tolY = 3.0;
  const rowsMap = new Map<number, Pt[]>();
  for (const p of pts) {
    if (header.includes(p.text)) continue;
    // assign to existing y key
    let key: number | null = null;
    for (const ky of rowsMap.keys()) { if (Math.abs(ky - p.y) <= tolY) { key = ky; break; } }
    const yk = key ?? p.y;
    const arr = rowsMap.get(yk) || [];
    arr.push(p);
    rowsMap.set(yk, arr);
  }

  const yKeys = Array.from(rowsMap.keys()).sort((a,b)=>b-a);
  const rows: string[][] = [];
  for (const y of yKeys) {
    const ps = rowsMap.get(y)!.sort((a,b)=>a.x-b.x);
    const cells = new Array(header.length).fill('');
    for (const p of ps) {
      // find nearest column by x
      let idx = 0, best = Infinity;
      for (let i=0;i<colXs.length;i++) { const d=Math.abs(p.x-colXs[i]); if (d<best){best=d; idx=i;} }
      cells[idx] = (cells[idx] ? cells[idx] + ' ' : '') + p.text;
    }
    // filter rows with a date-like first cell (accept -, /, . and optional time)
    if (/^\d{4}[-\/.]\d{2}[-\/.]\d{2}(?:\s+\d{2}:\d{2}(:\d{2})?)?$/.test(cells[0])) rows.push(cells);
  }

  const records: BocRecordRaw[] = rows.map(r => {
    const obj: BocRecordRaw = { 日期: r[header.indexOf(hDate!.label)] } as BocRecordRaw;
    const idx = (name: string) => header.indexOf(name);
    if (hCcy) obj.币种 = r[idx(hCcy.label)] || '';
    if (hDebit) obj.借方金额 = r[idx(hDebit.label)] || '';
    if (hCredit) obj.贷方金额 = r[idx(hCredit.label)] || '';
    if (hAmt) obj.金额 = r[idx(hAmt.label)] || '';
    if (hBal) obj.余额 = r[idx(hBal.label)] || '';
    if (hMemo) obj.摘要 = r[idx(hMemo.label)] || '';
    if (hPeer) obj.对方信息 = r[idx(hPeer.label)] || '';
    return obj;
  });

  return { header, rows, records };
}

export function bocAmountToNumber(s?: string): number {
  if (!s) return 0;
  const n = Number((s || '').replace(/,/g,'').replace(/¥/g,'').trim());
  return isNaN(n) ? 0 : n;
}
