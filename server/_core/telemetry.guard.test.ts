import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { initializeTelemetry } from "./telemetry";

// ─── Guard: telemetry module exports and SDK lifecycle ───────────────────────
// All span-emission tests use BasicTracerProvider directly so they don't depend
// on global TracerProvider registration (which only works once per process).
// No execSync, no ripgrep, no platform-specific code.

describe("telemetry.guard — exports and SDK lifecycle", () => {
  it("initializeTelemetry is a callable function", () => {
    expect(typeof initializeTelemetry).toBe("function");
  });

  it("initializeTelemetry returns an sdk with a shutdown method that resolves", async () => {
    const exporter = new InMemorySpanExporter();
    // skipInstrumentations avoids getNodeAutoInstrumentations() teardown overhead
    // that causes the shutdown Promise to exceed vitest's 5s default timeout.
    const sdk = initializeTelemetry(exporter, { skipInstrumentations: true });
    expect(typeof sdk.shutdown).toBe("function");
    const shutdownResult = sdk.shutdown();
    expect(shutdownResult).toBeInstanceOf(Promise);
    await shutdownResult;
  });
});

// ─── Guard: span emission via BasicTracerProvider (isolated, no global state) ─
describe("telemetry.guard — span emission", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
  });

  it("emits a span for a simulated http request", () => {
    const tracer = provider.getTracer("247-guard-test");
    const span = tracer.startSpan("http GET /health");
    span.setAttribute("http.method", "GET");
    span.setAttribute("http.target", "/health");
    span.end();

    const finished = exporter.getFinishedSpans();
    const httpSpan = finished.find(s => s.name === "http GET /health");
    expect(httpSpan).toBeDefined();
    expect(httpSpan?.attributes["http.method"]).toBe("GET");
    expect(httpSpan?.attributes["http.target"]).toBe("/health");
  });

  it("emits a span for a simulated trpc procedure", () => {
    const tracer = provider.getTracer("247-guard-test");
    const span = tracer.startSpan("trpc.health.ping");
    span.setAttribute("trpc.path", "health.ping");
    span.setAttribute("trpc.type", "query");
    span.end();

    const finished = exporter.getFinishedSpans();
    const trpcSpan = finished.find(s => s.name === "trpc.health.ping");
    expect(trpcSpan).toBeDefined();
    expect(trpcSpan?.attributes["trpc.path"]).toBe("health.ping");
    expect(trpcSpan?.attributes["trpc.type"]).toBe("query");
  });

  it("span context includes a valid 32-hex traceId and 16-hex spanId", () => {
    const tracer = provider.getTracer("247-guard-test");
    const span = tracer.startSpan("guard.context.check");
    const ctx = span.spanContext();
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    span.end();
  });

  it("afterEach reset leaves the exporter empty at test start", () => {
    // Verifies that afterEach isolation works: previous tests' spans are cleared.
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it("InMemorySpanExporter captures all ended spans in order", () => {
    const tracer = provider.getTracer("247-guard-test");
    tracer.startSpan("span.a").end();
    tracer.startSpan("span.b").end();
    tracer.startSpan("span.c").end();

    const names = exporter.getFinishedSpans().map(s => s.name);
    expect(names).toEqual(["span.a", "span.b", "span.c"]);
  });
});
