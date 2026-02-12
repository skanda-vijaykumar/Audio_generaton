"use client"

import { cn } from "@/lib/utils"

interface StatusDisplayProps {
  label: string
  value: string
  active?: boolean
}

export function StatusDisplay({ label, value, active = false }: StatusDisplayProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-[10px] font-mono uppercase tracking-wider transition-colors",
          active ? "text-primary glow-text" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  )
}
