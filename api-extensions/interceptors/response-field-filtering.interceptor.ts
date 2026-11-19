import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface FieldFilterQuery {
  fields?: string;
}

@Injectable()
export class ResponseFieldFilteringInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ query?: FieldFilterQuery }>();
    const rawFields = request?.query?.fields;

    if (!rawFields || typeof rawFields !== 'string' || rawFields.trim().length === 0) {
      return next.handle();
    }

    const fieldPaths = rawFields
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field.length > 0);

    if (fieldPaths.length === 0) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => this.filterResponse(data, fieldPaths)));
  }

  private filterResponse(data: unknown, fieldPaths: string[]): unknown {
    if (Array.isArray(data)) {
      return data.map((item) => this.filterObject(item, fieldPaths));
    }

    if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
      const envelope = data as Record<string, unknown>;
      return { ...envelope, data: this.filterResponse(envelope.data, fieldPaths) };
    }

    return this.filterObject(data, fieldPaths);
  }

  private filterObject(item: unknown, fieldPaths: string[]): unknown {
    if (item === null || typeof item !== 'object') {
      return item;
    }

    if (Array.isArray(item)) {
      return item.map((entry) => this.filterObject(entry, fieldPaths));
    }

    const result: Record<string, unknown> = {};
    for (const path of fieldPaths) {
      this.applyFieldPath(item as Record<string, unknown>, result, path.split('.'));
    }
    return result;
  }

  private applyFieldPath(
    source: Record<string, unknown>,
    target: Record<string, unknown>,
    segments: string[],
  ): void {
    const [head, ...rest] = segments;
    if (head === undefined || !(head in source)) {
      return;
    }

    const value = source[head];

    if (rest.length === 0) {
      target[head] = value;
      return;
    }

    if (Array.isArray(value)) {
      const existing = Array.isArray(target[head]) ? (target[head] as unknown[]) : [];
      target[head] = value.map((entry, index) => {
        if (entry === null || typeof entry !== 'object') {
          return entry;
        }
        const nestedTarget = (existing[index] as Record<string, unknown>) ?? {};
        this.applyFieldPath(entry as Record<string, unknown>, nestedTarget, rest);
        return nestedTarget;
      });
      return;
    }

    if (value && typeof value === 'object') {
      const nestedTarget = (target[head] as Record<string, unknown>) ?? {};
      this.applyFieldPath(value as Record<string, unknown>, nestedTarget, rest);
      target[head] = nestedTarget;
      return;
    }

    // Requested a nested path on a primitive/undefined value: nothing to filter into.
  }
}
