"use client"

import { cn } from "@/lib/utils"
import { Upload, FileAudio, FileText, X } from "lucide-react"
import { useCallback, useState, useRef } from "react"

interface UploadZoneProps {
  accept: string
  label: string
  description: string
  icon: "audio" | "document"
  onFileSelect: (file: File) => void
  selectedFile: File | null
  onClear: () => void
}

export function UploadZone({
  accept,
  label,
  description,
  icon,
  onFileSelect,
  selectedFile,
  onClear,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect]
  )

  const IconComponent = icon === "audio" ? FileAudio : FileText

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !selectedFile && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          if (!selectedFile) inputRef.current?.click()
        }
      }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 transition-all duration-300 cursor-pointer",
        "min-h-[180px]",
        isDragging
          ? "border-primary bg-primary/5 glow-cyan"
          : selectedFile
            ? "border-primary/30 bg-primary/[0.02]"
            : "border-border hover:border-primary/30 hover:bg-primary/[0.02]"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="sr-only"
        aria-label={label}
      />

      {selectedFile ? (
        <div className="flex flex-col items-center gap-3 animate-fade-in-up">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/5">
            <IconComponent className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-mono text-foreground truncate max-w-[240px]">
              {selectedFile.name}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remove file"
          >
            <X className="h-3 w-3" />
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary transition-all duration-300 group-hover:border-primary/30">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs font-mono uppercase tracking-wider text-foreground">
              {label}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground tracking-wide">
              {description}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
