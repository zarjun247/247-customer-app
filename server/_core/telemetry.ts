import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

/**
 * Initializes the OpenTelemetry SDK with trace instrumentation.
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set, spans are exported via OTLP HTTP
 * using a BatchSpanProcessor. When unset (local dev), spans go to stdout via
 * ConsoleSpanExporter with a SimpleSpanProcessor for immediate output.
 *
 * OTEL_SERVICE_NAME defaults to "247-customer-app".
 * OTEL_TRACES_SAMPLER and OTEL_TRACES_SAMPLER_ARG are read automatically by
 * the SDK from env vars (defaults: parentbased_traceidratio at ratio 1.0).
 *
 * Must be called before any instrumented modules are used.
 * Returns the NodeSDK instance for graceful shutdown on SIGTERM/SIGINT.
 *
 * @param traceExporterOverride - Optional exporter override, used in tests.
 * @param options.skipInstrumentations - Skip auto-instrumentations (test use only).
 */
export function initializeTelemetry(
  traceExporterOverride?: SpanExporter,
  { skipInstrumentations = false }: { skipInstrumentations?: boolean } = {}
): NodeSDK {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  let spanProcessor;
  if (traceExporterOverride) {
    spanProcessor = new SimpleSpanProcessor(traceExporterOverride);
  } else if (endpoint) {
    spanProcessor = new BatchSpanProcessor(
      new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
    );
  } else {
    // No OTLP endpoint — emit to console for local dev visibility.
    spanProcessor = new SimpleSpanProcessor(new ConsoleSpanExporter());
  }

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "247-customer-app",
    spanProcessors: [spanProcessor],
    instrumentations: skipInstrumentations
      ? []
      : [getNodeAutoInstrumentations()],
  });

  sdk.start();
  return sdk;
}
