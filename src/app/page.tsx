import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Hero */}
      <div className="relative z-10 text-center space-y-6 max-w-3xl mx-auto">
        {/* Brand */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-crimson/30 bg-crimson/10 text-crimson text-sm font-mono uppercase tracking-widest mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-crimson animate-glow-pulse" />
          Live Trading Engine
        </div>

        <h1 className="text-6xl font-bold tracking-tight">
          <span className="text-text-primary">NG</span>
          <span className="text-crimson text-glow-crimson">Funded</span>
        </h1>

        <p className="text-xl text-text-secondary max-w-xl mx-auto leading-relaxed">
          NextGen proprietary trading evaluation. Real-time risk enforcement, sub-50ms drawdown monitoring, and advanced performance analytics.
        </p>

        <div className="flex items-center justify-center gap-4 pt-4">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-crimson text-white font-semibold rounded-lg hover:bg-crimson/90 transition-all duration-200 shadow-glow-crimson hover:shadow-glow-crimson"
          >
            Open Dashboard
          </Link>
          <Link
            href="/auth/login"
            className="px-6 py-3 border border-border-bright text-text-primary font-semibold rounded-lg hover:border-crimson/50 hover:text-crimson transition-all duration-200"
          >
            Sign In
          </Link>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-8 pt-12 border-t border-border mt-8">
          {[
            { label: "Sub-50ms", desc: "Risk check latency" },
            { label: "Up to 90%", desc: "Profit split" },
            { label: "24/7", desc: "Live monitoring" },
          ].map(({ label, desc }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold text-cyan text-glow-cyan font-mono">{label}</div>
              <div className="text-sm text-text-muted mt-1">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(230,57,70,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(230,57,70,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
    </main>
  );
}
