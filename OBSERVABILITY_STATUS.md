Observability additions (backend-first)

- Added telemetry helpers: server/services/telemetry.ts
  - recordMetric(name, value, tags)
  - recordEvent(eventType, payload, severity)
- Telemetry currently emits structured JSON logs to stdout (log pipeline friendly).
- Next steps: wire recordMetric/recordEvent into middleware, provider webhook lifecycle and worker queues.
- Remaining gaps: metrics persistence (Influx/Prometheus), distributed tracing (OTel), and RBAC for observability APIs.
