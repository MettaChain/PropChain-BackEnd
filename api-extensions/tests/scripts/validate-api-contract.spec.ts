import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildTestCases,
  FetchLike,
  findResponseSpec,
  formatReport,
  loadSpec,
  OpenAPIDocument,
  parseArgs,
  runContractValidation,
  RunOptions,
  validateAgainstSchema,
  validateResponse,
} from '../../scripts/validate-api-contract';

const spec: OpenAPIDocument = {
  openapi: '3.0.0',
  paths: {
    '/api/v1/amenities': {
      get: {
        operationId: 'listAmenities',
        parameters: [
          { name: 'page', in: 'query', required: true, schema: { type: 'integer', default: 1 } },
        ],
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/AmenityDto' } },
              },
            },
          },
        },
      },
    },
    '/api/v1/amenities/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AmenityDto' } },
            },
          },
          '404': { description: 'not found' },
        },
      },
      delete: { responses: { '204': { description: 'deleted' } } },
    },
    '/api/v1/me': {
      get: {
        security: [{ 'access-token': [] }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
  components: {
    schemas: {
      AmenityDto: {
        type: 'object',
        required: ['id', 'name', 'type'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['POOL', 'GYM'] },
          capacity: { type: 'integer', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

const validAmenity = {
  id: '3f2b8c1e-8d1a-4c55-9a0b-2b7f5c2d9e10',
  name: 'Rooftop pool',
  type: 'POOL',
  capacity: null,
  createdAt: '2026-01-01T10:00:00.000Z',
};

const amenitySchema = { $ref: '#/components/schemas/AmenityDto' };

describe('validateAgainstSchema', () => {
  it('accepts a value that matches the schema', () => {
    expect(validateAgainstSchema(spec, validAmenity, amenitySchema)).toEqual([]);
  });

  it('reports missing required properties, type, enum and format mismatches', () => {
    const issues = validateAgainstSchema(
      spec,
      { id: 'not-a-uuid', type: 'SAUNA', capacity: '10' },
      amenitySchema,
    );
    const kinds = issues.map((issue) => `${issue.kind}@${issue.path}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'missing-required@$.name',
        'format-mismatch@$.id',
        'enum-mismatch@$.type',
        'type-mismatch@$.capacity',
      ]),
    );
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true);
  });

  it('reports undocumented properties as warnings', () => {
    const issues = validateAgainstSchema(
      spec,
      { ...validAmenity, internalNotes: 'x' },
      amenitySchema,
    );
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'undocumented-property',
        severity: 'warning',
        path: '$.internalNotes',
      }),
    ]);
  });

  it('validates array items with indexed paths', () => {
    const issues = validateAgainstSchema(spec, [validAmenity, { ...validAmenity, name: 42 }], {
      type: 'array',
      items: amenitySchema,
    });
    expect(issues).toEqual([expect.objectContaining({ kind: 'type-mismatch', path: '$[1].name' })]);
  });

  it('distinguishes integer from number', () => {
    expect(validateAgainstSchema(spec, 1.5, { type: 'integer' })).toHaveLength(1);
    expect(validateAgainstSchema(spec, 1.5, { type: 'number' })).toEqual([]);
  });

  it('supports nullable (3.0) and type arrays (3.1)', () => {
    expect(validateAgainstSchema(spec, null, { type: 'string', nullable: true })).toEqual([]);
    expect(validateAgainstSchema(spec, null, { type: ['string', 'null'] })).toEqual([]);
    expect(validateAgainstSchema(spec, null, { type: 'string' })).toEqual([
      expect.objectContaining({ kind: 'type-mismatch' }),
    ]);
  });

  it('merges allOf members before checking for undocumented properties', () => {
    const schema = {
      allOf: [
        amenitySchema,
        { type: 'object', properties: { rating: { type: 'number' } }, required: ['rating'] },
      ],
    };
    expect(validateAgainstSchema(spec, { ...validAmenity, rating: 4.5 }, schema)).toEqual([]);
    expect(validateAgainstSchema(spec, { ...validAmenity, rating: 4.5, extra: 1 }, schema)).toEqual(
      [expect.objectContaining({ kind: 'undocumented-property', path: '$.extra' })],
    );
  });

  it('requires at least one oneOf/anyOf variant to match', () => {
    const schema = { oneOf: [{ type: 'string' }, { type: 'integer' }] };
    expect(validateAgainstSchema(spec, 'a', schema)).toEqual([]);
    expect(validateAgainstSchema(spec, 7, schema)).toEqual([]);
    expect(validateAgainstSchema(spec, true, schema)).toEqual([
      expect.objectContaining({ kind: 'no-matching-variant' }),
    ]);
  });

  it('validates additionalProperties schemas and treats free-form objects as open', () => {
    const map = { type: 'object', additionalProperties: { type: 'integer' } };
    expect(validateAgainstSchema(spec, { a: 1, b: 2 }, map)).toEqual([]);
    expect(validateAgainstSchema(spec, { a: 'x' }, map)).toEqual([
      expect.objectContaining({ kind: 'type-mismatch', path: '$.a' }),
    ]);
    expect(validateAgainstSchema(spec, { anything: true }, { type: 'object' })).toEqual([]);
  });

  it('throws on unresolvable refs', () => {
    expect(() => validateAgainstSchema(spec, {}, { $ref: '#/components/schemas/Missing' })).toThrow(
      /Unresolvable \$ref/,
    );
  });
});

describe('findResponseSpec', () => {
  const operation = {
    responses: {
      '200': { description: 'exact' },
      '4XX': { description: 'range' },
      default: { description: 'fallback' },
    },
  };

  it('prefers exact codes, then ranges, then default', () => {
    expect(findResponseSpec(spec, operation, 200)?.description).toBe('exact');
    expect(findResponseSpec(spec, operation, 404)?.description).toBe('range');
    expect(findResponseSpec(spec, operation, 500)?.description).toBe('fallback');
  });
});

describe('validateResponse', () => {
  const operation = spec.paths['/api/v1/amenities/{id}'].get!;

  it('unwraps the ResponseFormatInterceptor envelope in auto mode', () => {
    const rawBody = JSON.stringify({ success: true, data: validAmenity, timestamp: 'now' });
    expect(
      validateResponse(spec, operation, { status: 200, contentType: 'application/json', rawBody }),
    ).toEqual([]);
  });

  it('reports drift inside the envelope with a $.data path', () => {
    const rawBody = JSON.stringify({ success: true, data: { ...validAmenity, type: 'SPA' } });
    expect(
      validateResponse(spec, operation, { status: 200, contentType: 'application/json', rawBody }),
    ).toEqual([expect.objectContaining({ kind: 'enum-mismatch', path: '$.data.type' })]);
  });

  it('does not unwrap when envelope mode is none', () => {
    const rawBody = JSON.stringify({ success: true, data: validAmenity });
    const issues = validateResponse(
      spec,
      operation,
      { status: 200, contentType: 'application/json', rawBody },
      'none',
    );
    expect(issues.map((issue) => issue.kind)).toContain('missing-required');
  });

  it('flags undocumented status codes', () => {
    expect(
      validateResponse(spec, operation, { status: 500, contentType: '', rawBody: '' }),
    ).toEqual([expect.objectContaining({ kind: 'undocumented-status', severity: 'error' })]);
  });

  it('flags non-JSON bodies where a JSON schema is documented', () => {
    expect(
      validateResponse(spec, operation, {
        status: 200,
        contentType: 'text/html',
        rawBody: '<html>',
      }),
    ).toEqual([expect.objectContaining({ kind: 'invalid-json' })]);
  });

  it('warns about bodies returned for responses without a schema', () => {
    expect(
      validateResponse(spec, operation, {
        status: 404,
        contentType: 'application/json',
        rawBody: '{}',
      }),
    ).toEqual([expect.objectContaining({ kind: 'undocumented-body', severity: 'warning' })]);
    expect(
      validateResponse(spec, operation, { status: 404, contentType: '', rawBody: '' }),
    ).toEqual([]);
  });
});

describe('buildTestCases', () => {
  it('resolves params from defaults and --param, and skips unresolved or unselected operations', () => {
    const withoutParams = buildTestCases(spec, { methods: ['get'], params: {} });
    expect(withoutParams.cases.map((testCase) => testCase.url)).toEqual([
      '/api/v1/amenities?page=1',
      '/api/v1/me',
    ]);
    expect(withoutParams.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pathTemplate: '/api/v1/amenities/{id}', method: 'get' }),
        expect.objectContaining({ pathTemplate: '/api/v1/amenities/{id}', method: 'delete' }),
      ]),
    );

    const withParams = buildTestCases(spec, { methods: ['get'], params: { id: 'a b' } });
    expect(withParams.cases.map((testCase) => testCase.url)).toContain('/api/v1/amenities/a%20b');
  });

  it('marks secured operations and honours include/exclude filters', () => {
    const { cases } = buildTestCases(spec, { methods: ['get'], params: {}, include: /me$/ });
    expect(cases).toEqual([
      expect.objectContaining({ pathTemplate: '/api/v1/me', requiresAuth: true }),
    ]);

    const excluded = buildTestCases(spec, { methods: ['get'], params: {}, exclude: /amenities/ });
    expect(excluded.cases.map((testCase) => testCase.pathTemplate)).toEqual(['/api/v1/me']);
  });
});

describe('runContractValidation', () => {
  const baseOptions: RunOptions = {
    baseUrl: 'http://api.test/',
    specSource: 'inline',
    methods: ['get'],
    params: { id: validAmenity.id },
    envelope: 'auto',
    strict: false,
    timeoutMs: 1000,
  };

  function fakeFetch(routes: Record<string, { status: number; body: unknown }>): jest.Mock {
    return jest.fn(async (url: string) => {
      const route = routes[url];
      if (!route) throw new Error(`connect ECONNREFUSED ${url}`);
      return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
        status: route.status,
        headers: { 'content-type': 'application/json' },
      });
    });
  }

  it('reports passes, drift, auth skips and request failures', async () => {
    const fetchImpl = fakeFetch({
      'http://api.test/api/v1/amenities?page=1': {
        status: 200,
        body: { success: true, data: [validAmenity] },
      },
      'http://api.test/api/v1/amenities/3f2b8c1e-8d1a-4c55-9a0b-2b7f5c2d9e10': {
        status: 200,
        body: { ...validAmenity, name: undefined },
      },
    });

    const report = await runContractValidation(
      spec,
      baseOptions,
      fetchImpl as unknown as FetchLike,
    );

    expect(report.summary).toEqual(
      expect.objectContaining({ tested: 2, passed: 1, drifted: 1, errors: 1, warnings: 0 }),
    );
    expect(report.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pathTemplate: '/api/v1/me',
          reason: expect.stringMatching(/auth/),
        }),
      ]),
    );
    expect(formatReport(report)).toMatch(/\[DRIFT\] GET \/api\/v1\/amenities\/\{id\}/);
  });

  it('sends auth headers, and counts warnings as drift in strict mode', async () => {
    const fetchImpl = fakeFetch({
      'http://api.test/api/v1/amenities?page=1': {
        status: 200,
        body: [{ ...validAmenity, extra: true }],
      },
      'http://api.test/api/v1/amenities/3f2b8c1e-8d1a-4c55-9a0b-2b7f5c2d9e10': {
        status: 200,
        body: validAmenity,
      },
    });

    const report = await runContractValidation(
      spec,
      { ...baseOptions, strict: true, token: 'jwt' },
      fetchImpl as unknown as FetchLike,
    );

    const meCall = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/api/v1/me'));
    expect(meCall?.[1].headers).toEqual(expect.objectContaining({ authorization: 'Bearer jwt' }));
    // /me is not routed by the fake → request-failed (error); list has an undocumented property (warning).
    expect(report.summary).toEqual(expect.objectContaining({ tested: 3, drifted: 2, warnings: 1 }));
    expect(report.results.find((result) => result.path === '/api/v1/me')?.issues[0].kind).toBe(
      'request-failed',
    );
  });
});

describe('loadSpec', () => {
  it('reads a spec from a file and rejects documents without paths', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-'));
    const good = path.join(dir, 'openapi.json');
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(good, JSON.stringify(spec));
    fs.writeFileSync(bad, JSON.stringify({ openapi: '3.0.0' }));

    await expect(loadSpec(good)).resolves.toEqual(spec);
    await expect(loadSpec(bad)).rejects.toThrow(/missing "paths"/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fetches a spec over HTTP', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify(spec), { status: 200 }));
    await expect(
      loadSpec('http://api.test/api/openapi.json', fetchImpl as unknown as FetchLike),
    ).resolves.toEqual(spec);

    const failing = jest.fn(async () => new Response('nope', { status: 503 }));
    await expect(
      loadSpec('http://api.test/api/openapi.json', failing as unknown as FetchLike),
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe('parseArgs', () => {
  it('applies defaults from the environment', () => {
    const options = parseArgs([], { API_BASE_URL: 'http://localhost:4000', API_TOKEN: 't' });
    expect(options).toEqual(
      expect.objectContaining({
        baseUrl: 'http://localhost:4000',
        specSource: 'http://localhost:4000/api/openapi.json',
        token: 't',
        methods: ['get'],
        envelope: 'auto',
        strict: false,
      }),
    );
  });

  it('parses flags', () => {
    const options = parseArgs(
      [
        '--spec',
        'spec.json',
        '--param',
        'id=abc=1',
        '--methods',
        'GET,HEAD',
        '--strict',
        '--envelope',
        'none',
        '--report',
        'out.json',
      ],
      {},
    );
    expect(options).toEqual(
      expect.objectContaining({
        specSource: 'spec.json',
        params: { id: 'abc=1' },
        methods: ['get', 'head'],
        strict: true,
        envelope: 'none',
        reportFile: 'out.json',
      }),
    );
  });

  it('rejects invalid input', () => {
    expect(() => parseArgs(['--methods', 'FETCH'], {})).toThrow(/Unsupported method/);
    expect(() => parseArgs(['--param', 'novalue'], {})).toThrow(/name=value/);
    expect(() => parseArgs(['--spec'], {})).toThrow(/Missing value/);
    expect(() => parseArgs(['--bogus'], {})).toThrow(/Unknown option/);
  });
});
