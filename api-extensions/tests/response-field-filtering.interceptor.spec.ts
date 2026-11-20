import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseFieldFilteringInterceptor } from '../interceptors/response-field-filtering.interceptor';

describe('ResponseFieldFilteringInterceptor', () => {
  let interceptor: ResponseFieldFilteringInterceptor;

  const createContext = (fields?: string): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ query: fields !== undefined ? { fields } : {} }),
      }),
    } as unknown as ExecutionContext;
  };

  const createHandler = (data: unknown): CallHandler => ({
    handle: () => of(data),
  });

  beforeEach(() => {
    interceptor = new ResponseFieldFilteringInterceptor();
  });

  it('is defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('passes the response through unchanged when fields query param is absent', (done) => {
    const data = { id: '1', title: 'Villa', price: 500000 };
    interceptor
      .intercept(createContext(undefined), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual(data);
        done();
      });
  });

  it('passes the response through unchanged when fields is an empty string', (done) => {
    const data = { id: '1', title: 'Villa' };
    interceptor
      .intercept(createContext(''), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual(data);
        done();
      });
  });

  it('filters a single object to only the requested fields', (done) => {
    const data = { id: '1', title: 'Villa', price: 500000, description: 'Nice place' };
    interceptor
      .intercept(createContext('title,price'), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual({ title: 'Villa', price: 500000 });
        done();
      });
  });

  it('ignores requested fields that are not present on the object', (done) => {
    const data = { id: '1', title: 'Villa' };
    interceptor
      .intercept(createContext('title,nonexistent'), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual({ title: 'Villa' });
        done();
      });
  });

  it('supports nested field filtering with dot notation', (done) => {
    const data = {
      id: '1',
      property: {
        title: 'Villa',
        price: 500000,
        location: { city: 'Lagos', country: 'Nigeria' },
      },
    };
    interceptor
      .intercept(createContext('property.title,property.price'), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual({
          property: { title: 'Villa', price: 500000 },
        });
        done();
      });
  });

  it('merges multiple nested field paths from the same parent object', (done) => {
    const data = {
      property: { title: 'Villa', price: 500000, bedrooms: 4 },
    };
    interceptor
      .intercept(
        createContext('property.title,property.price,property.bedrooms'),
        createHandler(data),
      )
      .subscribe((result) => {
        expect(result).toEqual({
          property: { title: 'Villa', price: 500000, bedrooms: 4 },
        });
        done();
      });
  });

  it('filters each item of an array response', (done) => {
    const data = [
      { id: '1', title: 'Villa', price: 500000 },
      { id: '2', title: 'Flat', price: 200000 },
    ];
    interceptor
      .intercept(createContext('title'), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual([{ title: 'Villa' }, { title: 'Flat' }]);
        done();
      });
  });

  it('filters arrays nested within an object using per-item filtering', (done) => {
    const data = {
      properties: [
        { title: 'Villa', price: 500000 },
        { title: 'Flat', price: 200000 },
      ],
    };
    interceptor
      .intercept(createContext('properties.title'), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual({
          properties: [{ title: 'Villa' }, { title: 'Flat' }],
        });
        done();
      });
  });

  it('filters data nested inside a response envelope with a data key', (done) => {
    const data = {
      data: { id: '1', title: 'Villa', price: 500000 },
      meta: { page: 1 },
    };
    interceptor
      .intercept(createContext('title'), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual({
          data: { title: 'Villa' },
          meta: { page: 1 },
        });
        done();
      });
  });

  it('returns primitives and null untouched', (done) => {
    interceptor
      .intercept(createContext('title'), createHandler(null))
      .subscribe((result) => {
        expect(result).toBeNull();
        done();
      });
  });

  it('trims whitespace around field names', (done) => {
    const data = { title: 'Villa', price: 500000 };
    interceptor
      .intercept(createContext(' title , price '), createHandler(data))
      .subscribe((result) => {
        expect(result).toEqual({ title: 'Villa', price: 500000 });
        done();
      });
  });
});
