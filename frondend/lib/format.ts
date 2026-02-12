/**
 * Format a duration in seconds as "MM:SS.Xs" or "00:SS.Xs".
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds - mins * 60
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}s`
}

/**
 * Format bytes as a human-readable size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
