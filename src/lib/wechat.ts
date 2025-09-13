export interface WechatRecordRaw {
  交易时间: string;
  交易类型: string;
  交易对方: string;
  商品: string;
  "收/支": string;
  "金额(元)": string;
  支付方式: string;
  当前状态: string;
  交易单号: string;
  商户单号: string;
  备注: string;
}

export interface WechatParseResult {
  header: string[];
  rows: string[][];
  records: WechatRecordRaw[];
}

const HEADER_PREFIX = "交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function sanitizeCell(cell: string): string {
  return cell.replace(/\t/g, "").replace(/\r/g, "").trim();
}

export async function parseWechatCsv(file: File): Promise<WechatParseResult> {
  // WeChat CSV is UTF-8 typically
  const text = await file.text();
  const lines = text.split(/\n/).map(l => l.replace(/\r$/, ""));
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().replace(/^\uFEFF/, "");
    if (line.startsWith(HEADER_PREFIX)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("未找到微信账单表头，请确认导出为CSV格式");
  }

  const header = parseCsvLine(lines[headerIdx]).map(sanitizeCell).slice(0, 11);
  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || /^-+$/.test(raw)) continue;
    const cols = parseCsvLine(raw).map(sanitizeCell);
    if (cols.every(c => c === "")) continue;
    const normalized = (cols.length >= 11 ? cols.slice(0, 11) : [...cols, ...Array(11 - cols.length).fill("")]);
    rows.push(normalized);
  }

  const records: WechatRecordRaw[] = rows.map(r => ({
    交易时间: r[0] || "",
    交易类型: r[1] || "",
    交易对方: r[2] || "",
    商品: r[3] || "",
    "收/支": r[4] || "",
    "金额(元)": r[5] || "",
    支付方式: r[6] || "",
    当前状态: r[7] || "",
    交易单号: r[8] || "",
    商户单号: r[9] || "",
    备注: r[10] || "",
  }));

  return { header, rows, records };
}

export function wechatAmountToNumber(amount: string): number {
  // e.g. "¥1,234.56" or "1.23"
  const s = amount.replace(/¥/g, '').replace(/,/g, '').trim();
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export function mapWechatTypeToTransaction(inout: string): 'income' | 'expense' | 'transfer' {
  if (inout === '收入') return 'income';
  if (inout === '支出') return 'expense';
  return 'transfer';
}

export async function parseWechatXlsx(file: File): Promise<WechatParseResult> {
  const mod: any = await import('xlsx');
  const XLSX = mod.default || mod;
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  // 2D array preserving raw text
  const aoa: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  // locate header row
  const headerRow = aoa.findIndex((r: any) => Array.isArray(r) && (r[0] || '').toString().startsWith('交易时间'));
  if (headerRow === -1) {
    throw new Error('未在XLSX中找到微信表头（交易时间开头）');
  }
  const header = (aoa[headerRow] as any[]).map((v) => String(v ?? '')).slice(0, 11);
  const rows: string[][] = [];
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const r = (aoa[i] || []).map((v: any) => String(v ?? ''));
    if (!r.some((c: string) => c.trim())) continue;
    const normalized = (r.length >= 11 ? r.slice(0, 11) : [...r, ...Array(11 - r.length).fill('')]);
    rows.push(normalized);
  }
  const records: WechatRecordRaw[] = rows.map(r => ({
    交易时间: r[0] || '',
    交易类型: r[1] || '',
    交易对方: r[2] || '',
    商品: r[3] || '',
    "收/支": r[4] || '',
    "金额(元)": r[5] || '',
    支付方式: r[6] || '',
    当前状态: r[7] || '',
    交易单号: r[8] || '',
    商户单号: r[9] || '',
    备注: r[10] || '',
  }));
  return { header, rows, records };
}

export async function parseWechatFile(file: File): Promise<WechatParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return parseWechatXlsx(file);
  if (name.endsWith('.csv')) return parseWechatCsv(file);
  // try CSV by default
  return parseWechatCsv(file);
}
