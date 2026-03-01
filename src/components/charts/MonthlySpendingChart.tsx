import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/utils/calculations";
import { Button } from "@/components/ui/button";

type TimePeriod = "daily" | "weekly" | "monthly" | "yearly";

interface MonthlySpendingChartProps {
  transactions: any[];
}

export function MonthlySpendingChart({ transactions }: MonthlySpendingChartProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("monthly");
  const [, setCurrencyUpdate] = useState(0);

  useEffect(() => {
    const handleCurrencyChange = () => setCurrencyUpdate(prev => prev + 1);
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);

  const getAggregatedData = () => {
    const expenses = transactions.filter((t) => t.type === "expense");
    const map: Record<string, number> = {};

    expenses.forEach((t) => {
      const date = new Date(t.date);
      let key: string;

      switch (timePeriod) {
        case "daily":
          key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          break;
        case "weekly":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          break;
        case "yearly":
          key = date.getFullYear().toString();
          break;
        case "monthly":
        default:
          key = date.toLocaleString("default", { month: "short", year: "2-digit" });
      }

      map[key] = (map[key] || 0) + t.amount;
    });

    return Object.entries(map)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => {
        const parseDate = (s: string) => new Date(`01 ${s}`);
        return parseDate(a.label).getTime() - parseDate(b.label).getTime();
      });
  };

  const data = getAggregatedData();

  if (data.length === 0) {
    return (
      <div className="glass-card p-5 h-80 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">No spending data</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 h-80 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground">Spending Insights</h3>
        <div className="flex gap-1">
          <Button
            variant={timePeriod === "daily" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimePeriod("daily")}
            className="h-7 px-2 text-xs"
          >
            Daily
          </Button>
          <Button
            variant={timePeriod === "weekly" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimePeriod("weekly")}
            className="h-7 px-2 text-xs"
          >
            Weekly
          </Button>
          <Button
            variant={timePeriod === "monthly" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimePeriod("monthly")}
            className="h-7 px-2 text-xs"
          >
            Monthly
          </Button>
          <Button
            variant={timePeriod === "yearly" ? "default" : "outline"}
            size="sm"
            onClick={() => setTimePeriod("yearly")}
            className="h-7 px-2 text-xs"
          >
            Yearly
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(262, 30%, 92%)" />
            <XAxis dataKey="label" tick={{ fill: "hsl(262, 25%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(262, 25%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(255,255,255,0.95)",
                border: "1px solid hsl(262, 60%, 88%)",
                borderRadius: "10px",
                color: "hsl(262, 40%, 25%)",
                boxShadow: "0 4px 16px hsl(262 83% 58% / 0.12)",
              }}
              formatter={(value: number) => [formatCurrency(value), "Spending"]}
            />
            <Bar
              dataKey="amount"
              fill="hsl(262, 83%, 62%)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
