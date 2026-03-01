import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from "recharts";

interface IncomeExpenseBarChartProps {
  data: { name: string; value: number }[];
}

export function IncomeExpenseBarChart({ data }: IncomeExpenseBarChartProps) {
  return (
    <div className="glass-card p-5 h-80 flex flex-col">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">Income vs Expense</h3>
      <div className="flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(262, 30%, 92%)" />
          <XAxis dataKey="name" tick={{ fill: "hsl(262, 25%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(262, 25%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255,255,255,0.95)",
              border: "1px solid hsl(262, 60%, 88%)",
              borderRadius: "10px",
              color: "hsl(262, 40%, 25%)",
              boxShadow: "0 4px 16px hsl(262 83% 58% / 0.12)",
            }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
            cursor={{ fill: "hsl(262 83% 58% / 0.05)" }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.name === "Income" ? "hsl(160, 84%, 39%)" : "hsl(347, 77%, 50%)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
