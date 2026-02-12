"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Download, Volume2, Pause, RotateCcw, X } from "lucide-react"
import { AudioWaveform } from "@/components/audio-waveform"
import { StepIndicator } from "@/components/step-indicator"
import { GlowButton } from "@/components/glow-button"
import { UploadZone } from "@/components/upload-zone"
import { StatusDisplay } from "@/components/status-display"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  uploadAudio,
  getGenerateUrl,
  getDownloadUrl,
  checkHealth,
  type UploadAudioResponse,
  type CompleteEvent,
} from "@/lib/api"
import { formatFileSize } from "@/lib/format"

const STEPS = ["Upload", "Process", "Script", "Generate"]

type EngineState =
  | "idle"
  | "audio-uploaded"
  | "processing"
  | "processed"
  | "script-uploaded"
  | "generating"
  | "complete"

export function VoiceEngine() {
  const [state, setState] = useState<EngineState>("idle")
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [scriptText, setScriptText] = useState("")
  const [progress, setProgress] = useState(0)
  const [generationStage, setGenerationStage] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [modelLoading, setModelLoading] = useState(true)
  const [modelStatus, setModelStatus] = useState("connecting")

  // Data from API
  const [taskId, setTaskId] = useState<string | null>(null)
  const [audioMetadata, setAudioMetadata] = useState<UploadAudioResponse | null>(null)
  const [outputMetadata, setOutputMetadata] = useState<CompleteEvent | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)

  const currentStep =
    state === "idle" || state === "audio-uploaded"
      ? 0
      : state === "processing"
        ? 1
        : state === "processed" || state === "script-uploaded"
          ? 2
          : state === "generating"
            ? 3
            : 4

  const handleAudioSelect = useCallback((file: File) => {
    setAudioFile(file)
    setState("audio-uploaded")
    setError(null)
  }, [])

  const handleAudioClear = useCallback(() => {
    setAudioFile(null)
    setState("idle")
  }, [])

  const handleProcessAudio = useCallback(async () => {
    if (!audioFile) return
    setState("processing")
    setProgress(0)
    setError(null)

    try {
      const data = await uploadAudio(audioFile)
      setTaskId(data.task_id)
      setAudioMetadata(data)
      setProgress(100)
      setTimeout(() => setState("processed"), 400)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      setState("audio-uploaded")
    }
  }, [audioFile])

  const handleGenerateVoice = useCallback(() => {
    if (!taskId || !scriptText.trim()) return
    setState("generating")
    setProgress(0)
    setGenerationStage("Initializing")
    setError(null)

    const url = getGenerateUrl({ task_id: taskId, text: scriptText.trim() })
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data)
      setProgress(data.progress)
      setGenerationStage(data.stage || "")
    })

    es.addEventListener("complete", (e) => {
      const data: CompleteEvent = JSON.parse(e.data)
      setOutputMetadata(data)
      setProgress(100)
      es.close()
      eventSourceRef.current = null
      setTimeout(() => setState("complete"), 600)
    })

    es.addEventListener("error", (e) => {
      // SSE error event — could be a server-sent error or a connection error
      if (e instanceof MessageEvent && e.data) {
        try {
          const data = JSON.parse(e.data)
          setError(data.error || "Generation failed")
        } catch {
          setError("Generation failed")
        }
      } else {
        setError("Connection to server lost")
      }
      es.close()
      eventSourceRef.current = null
      setState("script-uploaded")
    })
  }, [taskId, scriptText])

  const handleDownload = useCallback(() => {
    if (!taskId) return
    const a = document.createElement("a")
    a.href = getDownloadUrl(taskId)
    a.download = `voxsynth-${taskId}.wav`
    a.click()
  }, [taskId])

  const handleReset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState("idle")
    setAudioFile(null)
    setScriptText("")
    setProgress(0)
    setGenerationStage("")
    setIsPlaying(false)
    setError(null)
    setTaskId(null)
    setAudioMetadata(null)
    setOutputMetadata(null)
  }, [])

  const togglePlayback = useCallback(() => {
    setIsPlaying((prev) => !prev)
  }, [])

  const insertTag = useCallback(
    (tag: string) => {
      setScriptText((prev) => {
        const needsSpace = prev.length > 0 && !prev.endsWith(" ") && !prev.endsWith("\n")
        return prev + (needsSpace ? " " : "") + tag + " "
      })
      if (scriptText.trim() && state === "processed") {
        setState("script-uploaded")
      }
    },
    [scriptText, state],
  )

  // Track script text changes to toggle state
  useEffect(() => {
    if (state === "processed" && scriptText.trim()) {
      setState("script-uploaded")
    } else if (state === "script-uploaded" && !scriptText.trim()) {
      setState("processed")
    }
  }, [scriptText, state])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Poll API health until model is loaded
  useEffect(() => {
    if (modelReady) return
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        try {
          const h = await checkHealth()
          setModelStatus(h.model_status)
          if (h.model_loaded) {
            setModelReady(true)
            setModelLoading(false)
            return
          }
          if (h.model_status === "failed") {
            setModelLoading(false)
            setError(`Model failed to load: ${h.model_error ?? "unknown error"}`)
            return
          }
          setModelLoading(h.model_loading)
        } catch {
          // API not reachable yet
          setModelLoading(true)
          setModelStatus("connecting")
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    poll()
    return () => { cancelled = true }
  }, [modelReady])

  const getStatusText = () => {
    switch (state) {
      case "idle":
        return "AWAITING_INPUT"
      case "audio-uploaded":
        return "SAMPLE_LOADED"
      case "processing":
        return "ANALYZING"
      case "processed":
        return "SIGNATURE_READY"
      case "script-uploaded":
        return "SCRIPT_LOADED"
      case "generating":
        return "SYNTHESIZING"
      case "complete":
        return "OUTPUT_READY"
    }
  }

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="mb-10">
        <StepIndicator steps={STEPS} currentStep={currentStep} />
      </div>

      {/* Model loading banner */}
      {modelLoading && !modelReady && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-mono text-primary/80">
            {modelStatus === "connecting"
              ? "CONNECTING TO API…"
              : modelStatus === "downloading"
                ? "DOWNLOADING MODEL (~3 GB) — audio upload available, generation will be ready when complete"
                : "MODEL LOADING — audio upload available, generation will be ready shortly"}
          </span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 animate-fade-in-up">
          <span className="text-xs font-mono text-red-400 flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 transition-colors"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main card */}
      <div className="relative rounded-lg border border-border bg-card overflow-hidden">
        {/* Top header bar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors duration-300",
                state === "processing" || state === "generating"
                  ? "bg-primary animate-pulse-glow"
                  : state === "complete"
                    ? "bg-primary"
                    : "bg-muted-foreground/30"
              )}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              VOXSYNTH ENGINE v2.4
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-primary">
            {getStatusText()}
          </span>
        </div>

        {/* Content area */}
        <div className="p-6 md:p-8">
          {/* STEP 1: Upload Audio */}
          {(state === "idle" || state === "audio-uploaded") && (
            <div className="animate-fade-in-up">
              <div className="mb-5">
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-foreground mb-1">
                  Voice Sample
                </h2>
                <p className="text-[11px] font-mono text-muted-foreground tracking-wide">
                  Upload an audio file to extract the voice signature
                </p>
              </div>

              <UploadZone
                accept="audio/*"
                label="Drop audio file here"
                description="WAV, MP3, FLAC, OGG supported"
                icon="audio"
                onFileSelect={handleAudioSelect}
                selectedFile={audioFile}
                onClear={handleAudioClear}
              />

              {audioFile && (
                <div className="mt-6 flex justify-center animate-fade-in-up">
                  <GlowButton onClick={handleProcessAudio} size="lg">
                    Process Sample Audio
                  </GlowButton>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Processing */}
          {state === "processing" && (
            <div className="animate-fade-in-up">
              <div className="mb-8 text-center">
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-foreground mb-1">
                  Analyzing Voice Signature
                </h2>
                <p className="text-[11px] font-mono text-muted-foreground tracking-wide">
                  Extracting vocal patterns and characteristics
                </p>
              </div>

              <AudioWaveform active barCount={48} className="h-8 mb-8" />

              {/* Progress bar */}
              <div className="relative h-[2px] w-full bg-border rounded-full overflow-hidden mb-6">
                <div
                  className="absolute inset-y-0 left-0 bg-primary transition-all duration-150 glow-cyan"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Processing
                </span>
                <span className="text-[10px] font-mono text-primary">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          )}

          {/* STEP 3: Script Input */}
          {(state === "processed" || state === "script-uploaded") && (
            <div className="animate-fade-in-up">
              {/* Voice analysis results */}
              <div className="mb-6 rounded-lg border border-border bg-secondary/30 p-4">
                <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary mb-3">
                  Voice Signature Analysis
                </h3>
                <StatusDisplay label="Sample" value={audioFile?.name ?? "Unknown"} />
                <StatusDisplay label="Duration" value={audioMetadata?.duration_formatted ?? "—"} />
                <StatusDisplay label="Frequency Range" value={audioMetadata?.frequency_range ?? "—"} />
                <StatusDisplay label="Quality Score" value={audioMetadata ? `${audioMetadata.quality_score}%` : "—"} active />
                <StatusDisplay label="Signature ID" value={taskId ? `VX-${taskId.slice(0, 6).toUpperCase()}` : "—"} />
              </div>

              <div className="mb-3">
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-foreground mb-1">
                  Script
                </h2>
                <p className="text-[11px] font-mono text-muted-foreground tracking-wide">
                  Enter text with [S1] / [S2] speaker tags for dialogue
                </p>
              </div>

              {/* Speaker tag helper buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => insertTag("[S1]")}
                  className="px-2.5 py-1 rounded border border-primary/30 bg-primary/5 text-[10px] font-mono text-primary uppercase tracking-wider hover:bg-primary/10 transition-colors"
                >
                  [S1]
                </button>
                <button
                  onClick={() => insertTag("[S2]")}
                  className="px-2.5 py-1 rounded border border-primary/30 bg-primary/5 text-[10px] font-mono text-primary uppercase tracking-wider hover:bg-primary/10 transition-colors"
                >
                  [S2]
                </button>
              </div>

              <Textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="[S1] Hello, welcome to the demo.\n[S2] Thanks for trying it out!"
                className="min-h-[120px] font-mono text-sm bg-secondary/30 border-border focus:border-primary/50 resize-none"
                rows={5}
              />

              {scriptText.trim() && (
                <div className="mt-6 flex flex-col items-center gap-2 animate-fade-in-up">
                  {!modelReady && (
                    <span className="text-[10px] font-mono text-primary/60 uppercase tracking-wider">
                      Waiting for model to finish loading…
                    </span>
                  )}
                  <GlowButton onClick={handleGenerateVoice} size="lg" disabled={!modelReady}>
                    Generate Voice
                  </GlowButton>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Generating */}
          {state === "generating" && (
            <div className="animate-fade-in-up">
              <div className="mb-8 text-center">
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-foreground mb-1">
                  Synthesizing Voice Output
                </h2>
                <p className="text-[11px] font-mono text-muted-foreground tracking-wide">
                  Applying voice signature to script content
                </p>
              </div>

              <AudioWaveform active barCount={48} className="h-8 mb-8" />

              {/* Progress bar */}
              <div className="relative h-[2px] w-full bg-border rounded-full overflow-hidden mb-6">
                <div
                  className="absolute inset-y-0 left-0 bg-primary transition-all duration-150 glow-cyan"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    Stage
                  </p>
                  <p className="text-[10px] font-mono text-primary uppercase tracking-wider">
                    {generationStage || "Initializing"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    Progress
                  </p>
                  <p className="text-[10px] font-mono text-primary">
                    {Math.round(progress)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Complete */}
          {state === "complete" && (
            <div className="animate-fade-in-up">
              <div className="mb-8 text-center">
                <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-foreground mb-1">
                  Synthesis Complete
                </h2>
                <p className="text-[11px] font-mono text-muted-foreground tracking-wide">
                  Your voice output has been generated successfully
                </p>
              </div>

              {/* Output details */}
              <div className="mb-6 rounded-lg border border-primary/20 bg-primary/[0.02] p-4 glow-cyan">
                <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary mb-3">
                  Output Details
                </h3>
                <StatusDisplay label="Format" value={`WAV ${outputMetadata?.sample_rate ? `${(outputMetadata.sample_rate / 1000).toFixed(1)}kHz` : "—"}`} />
                <StatusDisplay label="Duration" value={outputMetadata?.duration_formatted ?? "—"} />
                <StatusDisplay label="File Size" value={outputMetadata?.file_size_bytes ? formatFileSize(outputMetadata.file_size_bytes) : "—"} />
              </div>

              {/* Playback visualizer */}
              <div className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-4">
                <button
                  onClick={togglePlayback}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-all"
                  aria-label={isPlaying ? "Pause preview" : "Play preview"}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <AudioWaveform active={isPlaying} barCount={40} className="flex-1 h-6" />
                <span className="text-[10px] font-mono text-muted-foreground">
                  {outputMetadata?.duration_formatted?.replace("s", "") ?? "—"}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <GlowButton onClick={handleDownload} size="lg">
                  <Download className="h-4 w-4" />
                  Download Audio
                </GlowButton>
                <GlowButton onClick={handleReset} variant="secondary" size="lg">
                  <RotateCcw className="h-4 w-4" />
                  Start Over
                </GlowButton>
              </div>
            </div>
          )}
        </div>

        {/* Bottom status bar */}
        <div className="flex items-center justify-between border-t border-border px-5 py-2.5">
          <div className="flex items-center gap-4">
            <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">
              {modelReady ? "SYS.OK" : "SYS.INIT"}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">
              {modelReady ? "MODEL.READY" : "MODEL.LOADING"}
            </span>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">
            NEURAL.NET.{modelReady ? "ACTIVE" : "WARMING"}
          </span>
        </div>
      </div>
    </div>
  )
}
