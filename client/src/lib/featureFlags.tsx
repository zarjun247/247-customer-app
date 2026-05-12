import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { trpc } from "./trpc";

export type AppPhase = "pilot" | "scaled" | "full";

const PHASE_ORDER: Record<AppPhase, number> = { pilot: 1, scaled: 2, full: 3 };

interface PhaseContextValue {
  phase: AppPhase;
  loading: boolean;
}

const PhaseContext = createContext<PhaseContextValue>({
  phase: "pilot",
  loading: false,
});

export function PhaseProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AppPhase>("pilot");
  const [loading, setLoading] = useState(true);

  const { data } = trpc.system.appPhase.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data?.phase) {
      setPhase(data.phase);
    }
    setLoading(false);
  }, [data]);

  return (
    <PhaseContext.Provider value={{ phase, loading }}>
      {children}
    </PhaseContext.Provider>
  );
}

export function usePhase(): PhaseContextValue {
  return useContext(PhaseContext);
}

export function isPhaseAtLeast(current: AppPhase, required: AppPhase): boolean {
  return PHASE_ORDER[current] >= PHASE_ORDER[required];
}

interface PhaseGateProps {
  required: AppPhase;
  feature: string;
  children: ReactNode;
}

export function PhaseGate({ required, feature, children }: PhaseGateProps) {
  const { phase, loading } = usePhase();

  if (loading) return null;

  if (!isPhaseAtLeast(phase, required)) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-muted/30 p-8 text-center">
        <div className="text-4xl">🚧</div>
        <h2 className="text-xl font-semibold text-muted-foreground">
          Coming soon
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          <strong>{feature}</strong> will be available when the system advances
          to phase <strong>{required}</strong>. Current phase:{" "}
          <strong>{phase}</strong>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
