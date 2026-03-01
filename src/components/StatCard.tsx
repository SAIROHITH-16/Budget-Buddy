import { ReactNode } from "react";
import React from "react";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: ReactNode;
  variant?: "default" | "income" | "expense";
  valueClassName?: string;   // overrides the variant-derived colour
  children?: ReactNode;
}

export function StatCard({ title, value, icon, variant = "default", valueClassName, children }: StatCardProps) {
  const variantStyles = {
    default: "stat-accent-primary",
    income:  "stat-accent-income stat-glow",
    expense: "stat-accent-expense",
  };

  const iconStyles = {
    default: "bg-primary/10 text-primary",
    income:  "bg-income/10  text-income",
    expense: "bg-expense/10 text-expense",
  };

  const valueStyles = {
    default: "text-foreground",
    income:  "income-text",
    expense: "expense-text",
  };

  return (
    <div className={`glass-card p-5 ${variantStyles[variant]} animate-fade-in overflow-hidden`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}>{title}</p>
        <div className={`p-2 rounded-lg ${iconStyles[variant]}`}>{icon}</div>
      </div>
      <p className={`text-2xl font-bold font-mono tracking-tight ${valueClassName ?? valueStyles[variant]}`}>
        {value}
      </p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
