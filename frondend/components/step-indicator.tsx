"use client"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

interface StepIndicatorProps {
  steps: string[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-mono transition-all duration-500",
                i < currentStep
                  ? "border-primary bg-primary text-primary-foreground glow-cyan"
                  : i === currentStep
                    ? "border-primary text-primary animate-pulse-glow glow-cyan"
                    : "border-border text-muted-foreground"
              )}
            >
              {i < currentStep ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span>{String(i + 1).padStart(2, "0")}</span>
              )}
            </div>
            <span
              className={cn(
                "text-[10px] font-mono uppercase tracking-[0.2em] transition-colors duration-300",
                i <= currentStep ? "text-primary glow-text" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "mx-3 mb-6 h-[1px] w-12 md:w-20 transition-all duration-500",
                i < currentStep ? "bg-primary/50" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
