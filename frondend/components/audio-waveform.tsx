"use client"

import { cn } from "@/lib/utils"

interface AudioWaveformProps {
  active?: boolean
  className?: string
  barCount?: number
}

export function AudioWaveform({ active = false, className, barCount = 32 }: AudioWaveformProps) {
  return (
    <div className={cn("flex items-center justify-center gap-[2px]", className)} role="img" aria-label={active ? "Audio processing in progress" : "Audio waveform idle"}>
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-[2px] rounded-full transition-all duration-300",
            active
              ? "bg-primary animate-waveform"
              : "bg-muted-foreground/20 h-1"
          )}
          style={
            active
              ? {
                  animationDelay: `${i * 0.05}s`,
                  animationDuration: `${0.5 + Math.random() * 0.6}s`,
                }
              : undefined
          }
        />
      ))}
    </div>
  )
}
