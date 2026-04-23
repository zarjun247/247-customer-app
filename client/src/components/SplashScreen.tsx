import { useEffect, useRef, useState, useCallback } from "react";

// ─── Logo URL ────────────────────────────────────────────────────────────────
const LOGO_URL = "/manus-storage/247-logo_fa5fce53.jpg";

// ─── Loading state sequence ───────────────────────────────────────────────────
const LOADING_STATES = [
  "Preparing your pharmacy",
  "Verifying secure access",
  "Connecting to your serving pharmacy",
  "Almost ready",
] as const;

// ─── Ripple type ─────────────────────────────────────────────────────────────
interface Ripple {
  id: number;
  x: number;
  y: number;
}

// ─── SplashScreen ─────────────────────────────────────────────────────────────
interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  // Animation phases
  const [phase, setPhase] = useState<
    "black" | "logo-reveal" | "tagline" | "loading" | "exit"
  >("black");
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [loadingVisible, setLoadingVisible] = useState(true);
  const [progressWidth, setProgressWidth] = useState(0);

  // Interaction
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const rippleCounter = useRef(0);

  // ── Animation timeline ────────────────────────────────────────────────────
  useEffect(() => {
    // Phase 1: black → logo reveal at 300ms
    const t1 = setTimeout(() => setPhase("logo-reveal"), 300);
    // Phase 2: tagline appears at 1600ms
    const t2 = setTimeout(() => setPhase("tagline"), 1600);
    // Phase 3: loading states start at 2400ms
    const t3 = setTimeout(() => setPhase("loading"), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // ── Loading state cycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "loading") return;

    const STEP_DURATION = 900; // ms per state
    const FADE_DURATION = 200; // ms fade out before switching

    let idx = 0;
    setLoadingIndex(0);
    setLoadingVisible(true);
    setProgressWidth(0);

    // Animate progress bar
    const progressTarget = (1 / LOADING_STATES.length) * 100;
    setProgressWidth(progressTarget);

    const interval = setInterval(() => {
      // Fade out current label
      setLoadingVisible(false);
      setTimeout(() => {
        idx = Math.min(idx + 1, LOADING_STATES.length - 1);
        setLoadingIndex(idx);
        setLoadingVisible(true);
        setProgressWidth(((idx + 1) / LOADING_STATES.length) * 100);

        if (idx === LOADING_STATES.length - 1) {
          clearInterval(interval);
          // Exit after last state
          setTimeout(() => {
            setPhase("exit");
            setTimeout(onComplete, 700);
          }, 700);
        }
      }, FADE_DURATION);
    }, STEP_DURATION);

    return () => clearInterval(interval);
  }, [phase, onComplete]);

  // ── Pointer tilt (desktop) ────────────────────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    // Max ±4 degrees — very subtle
    setTilt({ x: dy * -4, y: dx * 4 });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  // ── Touch/click ripple ────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const id = ++rippleCounter.current;
    setRipples(prev => [...prev, {
      id,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }]);
    // Remove after animation
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 1200);
  }, []);

  // ── Derived styles ────────────────────────────────────────────────────────
  const logoOpacity = phase === "black" ? 0 : 1;
  const logoScale = phase === "black" ? 0.88 : 1;
  const taglineOpacity = phase === "tagline" || phase === "loading" || phase === "exit" ? 1 : 0;
  const taglineY = phase === "tagline" || phase === "loading" || phase === "exit" ? 0 : 12;
  const containerOpacity = phase === "exit" ? 0 : 1;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: "default",
        opacity: containerOpacity,
        transition: "opacity 0.7s cubic-bezier(0.4,0,0.2,1)",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ── Ambient background glow — very subtle ──────────────────────── */}
      <div style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}>
        {/* Blue ambient — top-right */}
        <div style={{
          position: "absolute",
          top: "-20%",
          right: "-10%",
          width: "50vw",
          height: "50vw",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(43,127,255,0.06) 0%, transparent 70%)",
          opacity: phase === "black" ? 0 : 1,
          transition: "opacity 2s ease",
        }} />
        {/* Green ambient — bottom-left */}
        <div style={{
          position: "absolute",
          bottom: "-15%",
          left: "-5%",
          width: "40vw",
          height: "40vw",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,200,150,0.05) 0%, transparent 70%)",
          opacity: phase === "black" ? 0 : 1,
          transition: "opacity 2.5s ease",
        }} />
      </div>

      {/* ── Ripples ────────────────────────────────────────────────────── */}
      {ripples.map(r => (
        <div key={r.id} style={{
          position: "absolute",
          left: r.x,
          top: r.y,
          width: 0,
          height: 0,
          borderRadius: "50%",
          border: "1px solid rgba(43,127,255,0.25)",
          transform: "translate(-50%, -50%)",
          animation: "splashRipple 1.2s cubic-bezier(0.2,0.6,0.4,1) forwards",
          pointerEvents: "none",
        }} />
      ))}

      {/* ── Logo + tagline container with tilt ─────────────────────────── */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: "transform 0.4s cubic-bezier(0.2,0.8,0.3,1)",
        willChange: "transform",
      }}>

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div style={{
          position: "relative",
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          transition: "opacity 1.0s cubic-bezier(0.2,0,0.1,1), transform 1.2s cubic-bezier(0.2,0,0.1,1)",
          willChange: "opacity, transform",
        }}>
          {/* Logo image */}
          <img
            src={LOGO_URL}
            alt="24/7 Pharmacy"
            draggable={false}
            style={{
              width: "min(72vw, 280px)",
              height: "auto",
              display: "block",
              // Isolate the logo on black — it already has a black bg
              borderRadius: "4px",
            }}
          />

          {/* Blue slash glow trace — SVG overlay aligned to slash position */}
          <div style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: "4px",
          }}>
            <svg
              viewBox="0 0 280 280"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Glow trace along the blue slash — diagonal line */}
              <line
                x1="148" y1="52"
                x2="138" y2="185"
                stroke="rgba(43,127,255,0.0)"
                strokeWidth="6"
                strokeLinecap="round"
                style={{
                  animation: phase !== "black"
                    ? "slashGlowTrace 2.4s cubic-bezier(0.4,0,0.2,1) 0.8s forwards"
                    : "none",
                }}
              />
            </svg>
          </div>

          {/* Green 7 soft pulse overlay */}
          <div style={{
            position: "absolute",
            right: "8%",
            top: "12%",
            width: "28%",
            height: "60%",
            borderRadius: "4px",
            background: "rgba(0,200,150,0.0)",
            animation: phase !== "black"
              ? "greenPulse 3s ease-in-out 1.2s infinite"
              : "none",
            pointerEvents: "none",
          }} />
        </div>

        {/* ── Tagline — three brand messages ───────────────────────────── */}
        <div style={{
          marginTop: "28px",
          textAlign: "center",
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          transition: "opacity 0.9s cubic-bezier(0.2,0,0.1,1), transform 0.9s cubic-bezier(0.2,0,0.1,1)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
        }}>
          {/* Line 1: Instant Care. */}
          <p style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            fontSize: "clamp(15px, 4vw, 18px)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "rgba(255,255,255,0.82)",
            margin: 0,
            opacity: taglineOpacity,
            transition: "opacity 0.9s cubic-bezier(0.2,0,0.1,1) 0s",
          }}>
            Instant Care.
          </p>
          {/* Line 2: Infinite Trust. */}
          <p style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            fontSize: "clamp(15px, 4vw, 18px)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "rgba(255,255,255,0.82)",
            margin: 0,
            opacity: taglineOpacity,
            transition: "opacity 0.9s cubic-bezier(0.2,0,0.1,1) 0.15s",
          }}>
            Infinite Trust.
          </p>
          {/* Separator */}
          <div style={{
            width: "24px",
            height: "1px",
            background: "rgba(43,127,255,0.35)",
            margin: "4px 0",
          }} />
          {/* Line 3: Always On */}
          <p style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            fontSize: "clamp(10px, 2.8vw, 12px)",
            fontWeight: 400,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)",
            margin: 0,
            opacity: taglineOpacity,
            transition: "opacity 0.9s cubic-bezier(0.2,0,0.1,1) 0.3s",
          }}>
            Always On
          </p>
        </div>
      </div>

      {/* ── Loading state + progress ────────────────────────────────────── */}
      <div style={{
        position: "absolute",
        bottom: "max(48px, 8vh)",
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px",
        opacity: phase === "loading" || phase === "exit" ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}>
        {/* Loading text */}
        <p style={{
          fontFamily: "'Inter', -apple-system, sans-serif",
          fontSize: "clamp(11px, 3vw, 13px)",
          fontWeight: 400,
          color: "rgba(255,255,255,0.40)",
          letterSpacing: "0.04em",
          margin: 0,
          opacity: loadingVisible ? 1 : 0,
          transform: loadingVisible ? "translateY(0)" : "translateY(4px)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}>
          {LOADING_STATES[loadingIndex]}
        </p>

        {/* Progress bar — thin, electric blue sweep */}
          <div style={{
            width: "min(180px, 45vw)",
            height: "1px",
            background: "rgba(255,255,255,0.07)",
            borderRadius: "1px",
            overflow: "hidden",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${progressWidth}%`,
              background: "rgba(43,127,255,0.85)",
              borderRadius: "1px",
              transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
            }} />
          </div>
      </div>

      {/* ── Keyframe styles ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes splashRipple {
          0%   { width: 0; height: 0; opacity: 0.6; }
          100% { width: 300px; height: 300px; opacity: 0; }
        }

        @keyframes slashGlowTrace {
          0%   { stroke: rgba(43,127,255,0.0); stroke-dashoffset: 200; stroke-dasharray: 200; }
          20%  { stroke: rgba(43,127,255,0.55); }
          60%  { stroke: rgba(43,127,255,0.55); stroke-dashoffset: 0; }
          100% { stroke: rgba(43,127,255,0.0); stroke-dashoffset: 0; }
        }

        @keyframes greenPulse {
          0%   { background: rgba(0,200,150,0.0); }
          30%  { background: rgba(0,200,150,0.06); }
          60%  { background: rgba(0,200,150,0.03); }
          100% { background: rgba(0,200,150,0.0); }
        }
      `}</style>
    </div>
  );
}
