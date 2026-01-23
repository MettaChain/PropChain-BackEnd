import { createNamespace } from 'cls-hooked';

export const CORRELATION_ID_NAMESPACE = 'app';
export const CORRELATION_ID_KEY = 'correlationId';

export const correlationNamespace = createNamespace(CORRELATION_ID_NAMESPACE);

export const getCorrelationId = (): string => {
  return correlationNamespace.get(CORRELATION_ID_KEY);
};
