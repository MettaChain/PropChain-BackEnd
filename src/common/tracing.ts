import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/instrumentation-http';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

export const otelSDK = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'propchain-backend',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: new OTLPTraceExporter({
    url: otlpEndpoint,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

process.on('SIGTERM', () => {
  otelSDK.shutdown().catch(console.error);
});
