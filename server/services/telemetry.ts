import { serializeSafeLog, SafeStructuredLog } from './observability';

export interface MetricTags { [k: string]: string | number | null }

export function recordMetric(name: string, value: number, tags?: MetricTags) {
  const payload = {
    ts: new Date().toISOString(),
    name,
    value,
    tags: tags ?? {},
  };
  try {
    // Structured, machine-readable output (captured by log pipeline)
    console.log(JSON.stringify({ type: 'metric', ...payload }));
  } catch (err) {
    // best-effort
    console.info('metric', name, value, tags);
  }
}

export function recordEvent(eventType: string, payload: unknown, severity: 'info' | 'warning' | 'critical' = 'info') {
  try {
    const level = severity === 'critical' ? 'error' : severity === 'warning' ? 'warn' : 'info';
    const entry: SafeStructuredLog = { event: eventType, level, meta: payload };
    const serialized = serializeSafeLog(entry);
    const parsed = JSON.parse(serialized);
    console.log(JSON.stringify({ type: 'event', ts: new Date().toISOString(), ...parsed }));
  } catch (err) {
    console.info('event', eventType, severity, payload);
  }
}
