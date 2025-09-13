export interface AlipayRecordRaw {
  交易时间: string;
  交易分类: string;
  交易对方: string;
  对方账号: string;
  商品说明: string;
  "收/支": string;
  金额: string;
  "收/付款方式": string;
  交易状态: string;
  交易订单号: string;
  商家订单号: string;
  备注: string;
}

export interface AlipayParseResult {
  header: string[];
  rows: string[][];
  records: AlipayRecordRaw[];
}

const HEADER_PREFIX = "交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注";

function tryDecode(buffer: ArrayBuffer, enc: string): string | null {
  try {
    // Some browsers may not support all encodings; guard with try/catch
    const dec = new TextDecoder(enc as any, { fatal: false });
    return dec.decode(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

function decodeBestEffort(buffer: ArrayBuffer): string {
  const candidates = ["gb18030", "gbk", "gb2312", "utf-8"];
  for (const enc of candidates) {
    const text = tryDecode(buffer, enc);
    if (text && text.includes("支付宝") || (text && text.includes("交易时间"))) {
      return text;
    }
  }
  // Fallback to UTF-8 if nothing matched
  const utf8 = tryDecode(buffer, "utf-8");
  return utf8 ?? "";
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
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

export async function parseAlipayCsv(file: File): Promise<AlipayParseResult> {
  const buffer = await file.arrayBuffer();
  const text = decodeBestEffort(buffer);
  if (!text) throw new Error("无法解码文件内容");

  const lines = text.split(/\n/).map(l => l.replace(/\r$/, ""));
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().replace(/^\uFEFF/, ""); // strip BOM if present
    if (line.startsWith(HEADER_PREFIX)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("未找到支付宝表头，请确认是支付宝导出的CSV");
  }

  const header = parseCsvLine(lines[headerIdx]).map(sanitizeCell).slice(0, 12);
  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || /^-+$/.test(raw)) continue;
    const cols = parseCsvLine(raw).map(sanitizeCell);
    if (cols.every(c => c === "")) continue;
    const normalized = (cols.length >= 12 ? cols.slice(0, 12) : [...cols, ...Array(12 - cols.length).fill("")]);
    rows.push(normalized);
  }

  const records: AlipayRecordRaw[] = rows.map(r => ({
    交易时间: r[0] || "",
    交易分类: r[1] || "",
    交易对方: r[2] || "",
    对方账号: r[3] || "",
    商品说明: r[4] || "",
    "收/支": r[5] || "",
    金额: r[6] || "",
    "收/付款方式": r[7] || "",
    交易状态: r[8] || "",
    交易订单号: r[9] || "",
    商家订单号: r[10] || "",
    备注: r[11] || "",
  }));

  return { header, rows, records };
}

export function mapAlipayTypeToTransaction(type: string): 'income' | 'expense' | 'transfer' {
  if (type === '收入') return 'income';
  if (type === '支出') return 'expense';
  return 'transfer'; // 不计收支等
}

