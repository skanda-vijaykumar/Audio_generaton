const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

// ---------- Types ----------

export interface UploadAudioResponse {
  task_id: string
  filename: string
  duration: number
  duration_formatted: string
  sample_rate: number
  channels: number
  frequency_range: string
  quality_score: number
}

export interface GenerateParams {
  task_id: string
  text: string
  max_tokens?: number
  cfg_scale?: number
  temperature?: number
  top_p?: number
  cfg_filter_top_k?: number
}

export interface ProgressEvent {
  status: string
  progress: number
  stage: string
}

export interface CompleteEvent {
  task_id: string
  duration_formatted: string
  sample_rate: number
  file_size_bytes: number
}

export interface HealthResponse {
  status: string
  model_loaded: boolean
  model_loading: boolean
  model_status: string       // "idle" | "downloading" | "ready" | "failed"
  model_error: string | null
  device: string | null
}

// ---------- API calls ----------

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`)
  if (!res.ok) throw new Error("API unreachable")
  return res.json()
}

export async function uploadAudio(file: File): Promise<UploadAudioResponse> {
  const form = new FormData()
  form.append("file", file)

  const res = await fetch(`${API_URL}/api/upload-audio`, {
    method: "POST",
    body: form,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Upload failed (${res.status})`)
  }

  return res.json()
}

export function getGenerateUrl(params: GenerateParams): string {
  const u = new URL(`${API_URL}/api/generate`)
  u.searchParams.set("task_id", params.task_id)
  u.searchParams.set("text", params.text)
  if (params.max_tokens != null)
    u.searchParams.set("max_tokens", String(params.max_tokens))
  if (params.cfg_scale != null)
    u.searchParams.set("cfg_scale", String(params.cfg_scale))
  if (params.temperature != null)
    u.searchParams.set("temperature", String(params.temperature))
  if (params.top_p != null)
    u.searchParams.set("top_p", String(params.top_p))
  if (params.cfg_filter_top_k != null)
    u.searchParams.set("cfg_filter_top_k", String(params.cfg_filter_top_k))
  return u.toString()
}

export function getDownloadUrl(taskId: string): string {
  return `${API_URL}/api/download/${taskId}`
}
