import { createNamespace, Namespace } from 'cls-hooked';

export const CORRELATION_ID_KEY = 'correlationId';
export const TRACE_ID_KEY = 'traceId';
export const SPAN_ID_KEY = 'spanId';

const ns: Namespace = createNamespace('propchain-request');

export const getCorrelationId = (): string | undefined => {
  return ns.get(CORRELATION_ID_KEY);
};

export const getTraceId = (): string | undefined => {
  return ns.get(TRACE_ID_KEY);
};

export const getSpanId = (): string | undefined => {
  return ns.get(SPAN_ID_KEY);
};

export const withCorrelationId = (fn: () => void, correlationId: string): void => {
  ns.run(() => {
    ns.set(CORRELATION_ID_KEY, correlationId);
    const existingTraceId = ns.get(TRACE_ID_KEY);
    if (!existingTraceId) {
      ns.set(TRACE_ID_KEY, correlationId);
    }
    fn();
  });
};

export const getNamespace = (): Namespace => {
  return ns;
};
