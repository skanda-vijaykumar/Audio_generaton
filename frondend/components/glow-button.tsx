"use client"

import { cn } from "@/lib/utils"
import { forwardRef } from "react"

interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
  loading?: boolean
}

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "relative group inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.15em] transition-all duration-300 overflow-hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-40",
          // Size
          size === "sm" && "h-9 px-4 text-[10px]",
          size === "md" && "h-11 px-6 text-xs",
          size === "lg" && "h-14 px-8 text-sm",
          // Variant
          variant === "primary" && [
            "border border-primary/40 bg-primary/5 text-primary",
            "hover:bg-primary/10 hover:border-primary/60 hover:glow-cyan-strong",
            "active:bg-primary/15",
          ],
          variant === "secondary" && [
            "border border-border bg-secondary text-secondary-foreground",
            "hover:border-primary/30 hover:text-primary",
          ],
          variant === "ghost" && [
            "text-muted-foreground",
            "hover:text-primary hover:bg-primary/5",
          ],
          className
        )}
        {...props}
      >
        {/* Shimmer effect on hover */}
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/5 to-transparent group-hover:animate-shimmer" />

        {loading && (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
          </span>
        )}
        <span className="relative z-10">{children}</span>
      </button>
    )
  }
)
GlowButton.displayName = "GlowButton"
