import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/utils/calculations";

const COLORS = [
  "hsl(262, 83%, 58%)",  /* Violet          */
  "hsl(160, 84%, 39%)",  /* Emerald         */
  "hsl(38,  92%, 50%)",  /* Amber           */
  "hsl(347, 77%, 50%)",  /* Rose            */
  "hsl(235, 80%, 62%)",  /* Indigo          */
  "hsl(290, 65%, 55%)",  /* Fuchsia         */
  "hsl(199, 89%, 48%)",  /* Sky             */
  "hsl(280, 75%, 60%)",  /* Amethyst        */
];

interface CategoryPieChartProps {
  data: { name: string; value: number }[];
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  if (data.length === 0) {
    return (
      <div className="glass-card p-5 h-80 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">No data to display</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 h-80 flex flex-col">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">Category Distribution</h3>
      <div className="flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255,255,255,0.95)",
              border: "1px solid hsl(262, 60%, 88%)",
              borderRadius: "10px",
              color: "hsl(262, 40%, 25%)",
              boxShadow: "0 4px 16px hsl(262 83% 58% / 0.12)",
            }}
            formatter={(value: number) => [formatCurrency(value), ""]}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "hsl(262, 25%, 45%)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
