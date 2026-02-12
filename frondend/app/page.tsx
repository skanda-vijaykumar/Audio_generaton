import { VoiceEngine } from "@/components/voice-engine"

export default function Page() {
  return (
    <main className="relative min-h-screen bg-background noise scanlines overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(180 100% 50% / 0.3) 1px, transparent 1px),
            linear-gradient(90deg, hsl(180 100% 50% / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Top radial glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/[0.03] rounded-full blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center px-4 py-16 md:py-24">
        {/* Header */}
        <header className="mb-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5">
            <div className="h-1 w-1 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
              AI Voice Synthesis Engine
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-sans font-light tracking-tight text-foreground mb-3 text-balance">
            VOX<span className="text-primary glow-text">SYNTH</span>
          </h1>
          <p className="text-xs md:text-sm font-mono text-muted-foreground tracking-wide max-w-md mx-auto text-pretty">
            Upload a voice sample, extract its signature, and synthesize new speech from any script document.
          </p>
        </header>

        {/* Voice Engine */}
        <VoiceEngine />

        {/* Footer */}
        <footer className="mt-20 text-center">
          <p className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-[0.3em]">
            Neural Voice Processing Pipeline
          </p>
        </footer>
      </div>
    </main>
  )
}
