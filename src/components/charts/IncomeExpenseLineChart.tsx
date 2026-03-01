import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/utils/calculations";

interface IncomeExpenseLineChartProps {
  data: { name: string; Income: number; Expense: number }[];
}

export function IncomeExpenseLineChart({ data }: IncomeExpenseLineChartProps) {
  const [, setCurrencyUpdate] = useState(0);

  useEffect(() => {
    const handleCurrencyChange = () => setCurrencyUpdate(prev => prev + 1);
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);

  return (
    <div className="glass-card p-5 h-80 flex flex-col">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">Income vs Expense Trend</h3>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(262, 30%, 92%)" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: "hsl(262, 25%, 50%)", fontSize: 12 }} 
              axisLine={false} 
              tickLine={false} 
            />
            <YAxis 
              tick={{ fill: "hsl(262, 25%, 50%)", fontSize: 12 }} 
              axisLine={false} 
              tickLine={false} 
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(255,255,255,0.95)",
                border: "1px solid hsl(262, 60%, 88%)",
                borderRadius: "10px",
                color: "hsl(262, 40%, 25%)",
                boxShadow: "0 4px 16px hsl(262 83% 58% / 0.12)",
              }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend 
              wrapperStyle={{ paddingTop: "10px", color: "hsl(262, 25%, 45%)" }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="Income"
              stroke="hsl(160, 84%, 39%)"
              strokeWidth={2.5}
              dot={{ fill: "hsl(160, 84%, 39%)", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "hsl(160, 84%, 39%)", strokeWidth: 2, stroke: "hsl(0,0%,100%)" }}
            />
            <Line
              type="monotone"
              dataKey="Expense"
              stroke="hsl(347, 77%, 50%)"
              strokeWidth={2.5}
              dot={{ fill: "hsl(347, 77%, 50%)", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "hsl(347, 77%, 50%)", strokeWidth: 2, stroke: "hsl(0,0%,100%)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
