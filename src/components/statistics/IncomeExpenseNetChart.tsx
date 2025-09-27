import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";

interface IncomeExpenseNetChartProps {
  transactions: any[];
  startDate: Date | null;
  endDate: Date | null;
  selectedPeriod?: string;
}

type Granularity = "day" | "week" | "month";

const IncomeExpenseNetChart = ({ transactions, startDate, endDate, selectedPeriod }: IncomeExpenseNetChartProps) => {
  const autoGranularity: Granularity = (() => {
    if (selectedPeriod === "年") return "month";
    if (selectedPeriod === "周") return "day";
    if (startDate && endDate) {
      const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
      if (days > 180) return "month";
      if (days > 35) return "week";
    }
    return "day";
  })();
  const granularity: Granularity = autoGranularity;

  const { rangeStart, rangeEnd } = useMemo(() => {
    let s = startDate ?? (transactions.length ? new Date(transactions[0].date) : startOfMonth(new Date()));
    let e = endDate ?? (transactions.length ? new Date(transactions[transactions.length - 1].date) : endOfMonth(new Date()));
    if (s > e) [s, e] = [e, s];
    return { rangeStart: s, rangeEnd: e };
  }, [startDate, endDate, transactions]);

  const data = useMemo(() => {
    // produce bins
    type Bin = { key: string; label: string; income: number; expense: number; balance: number };
    const bins = new Map<string, Bin>();
    const addBin = (key: string, label: string) => {
      if (!bins.has(key)) bins.set(key, { key, label, income: 0, expense: 0, balance: 0 });
    };

    if (granularity === "day") {
      eachDayOfInterval({ start: rangeStart, end: rangeEnd }).forEach(d => addBin(format(d, "yyyy-MM-dd"), format(d, "M-d")));
    } else if (granularity === "week") {
      eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 }).forEach(d => {
        const k = format(d, "yyyy-ww");
        const lab = `${format(startOfWeek(d, { weekStartsOn: 1 }), "M/d")}~${format(endOfWeek(d, { weekStartsOn: 1 }), "M/d")}`;
        addBin(k, lab);
      });
    } else {
      eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).forEach(d => addBin(format(d, "yyyy-MM"), format(d, "yyyy-MM")));
    }

    // fill with transactions
    for (const t of transactions) {
      if (!t || !t.date) continue;
      const d = new Date(typeof t.date === "string" ? t.date.slice(0, 10) : t.date);
      let key = "";
      if (granularity === "day") key = format(d, "yyyy-MM-dd");
      else if (granularity === "week") key = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-ww");
      else key = format(d, "yyyy-MM");
      const bin = bins.get(key);
      if (!bin) continue;
      const amt = Math.abs(Number(t.amount) || 0);
      if (t.type === "income") bin.income += amt;          // 收入为正
      else if (t.type === "expense") bin.expense -= amt;   // 支出为负（放到 -y 侧）
    }
    bins.forEach(b => (b.balance = b.income + b.expense)); // 净结余 = 收入 + 支出(负)

    return Array.from(bins.values());
  }, [transactions, rangeStart, rangeEnd, granularity]);

  // Compute Y domain to ensure 0 在中间可见，并包含负值
  const [yMin, yMax] = useMemo(() => {
    if (!data.length) return [0, 0];
    let minV = 0, maxV = 0;
    for (const d of data) {
      minV = Math.min(minV, d.income, d.expense, d.balance);
      maxV = Math.max(maxV, d.income, d.expense, d.balance);
    }
    // 留一点空间
    const pad = (v: number) => (v > 0 ? v * 1.1 : v * 1.1);
    return [pad(minV), pad(maxV)];
  }, [data]);

  const formatCurrency = (n: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(n);
  const formatTick = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
    if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return `${Math.round(v)}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span className="text-lg">📊</span>
          收支结余
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={12} />
              <YAxis width={48} domain={[yMin, yMax]} tickFormatter={formatTick} axisLine={false} tickLine={false} fontSize={12} />
              <Tooltip formatter={(val: any, name: any) => [formatCurrency(Number(val)), name]} />
              <ReferenceLine y={0} stroke="#ddd" />
              {/* 同一时间戳的收入、支出在同一条垂直线上：使用相同 stackId，收入在 +y，支出在 -y */}
              <Bar dataKey="income" name="收入" fill="#ef4444" stackId="pair" radius={[2,2,0,0]} />
              <Bar dataKey="expense" name="支出" fill="#10b981" stackId="pair" radius={[0,0,2,2]} />
              <Line dataKey="balance" name="净结余" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default IncomeExpenseNetChart;
