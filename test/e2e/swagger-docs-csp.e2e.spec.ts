/**
 * E2E test: Swagger UI at /api/docs renders under the app's CSP.
 *
 * Previously setupSwagger injected swagger-ui-dist@3 scripts from jsDelivr,
 * which the `script-src 'self'` CSP blocked and which don't match the v5 UI
 * layout. The UI must now load only same-origin assets, and the CSP on the
 * docs route must allow everything the page references.
 */

import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { createSecurityHeadersMiddleware } from '../../src/config/security-headers';
import {
  DEFAULT_CONTENT_SECURITY_POLICY,
  buildDocsContentSecurityPolicy,
  isSwaggerDocsPath,
  setupSwagger,
} from '../../src/config/swagger.config';

@Controller('properties')
class SampleController {
  @Get()
  list() {
    return [];
  }
}

function cspDirectives(header: string): Map<string, string[]> {
  return new Map(
    header
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name, values]),
  );
}

describe('Swagger UI under CSP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SampleController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(createSecurityHeadersMiddleware());
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the docs page with only same-origin scripts and stylesheets', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs').redirects(1).expect(200);
    const html: string = res.text;

    expect(html).toContain('<div id="swagger-ui"></div>');
    expect(html).not.toMatch(/cdn\.jsdelivr\.net|unpkg\.com|swagger-ui-dist@3/);

    const scriptSrcs = [...html.matchAll(/<script[^>]*\ssrc=['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const linkHrefs = [...html.matchAll(/<link[^>]*\shref=['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(scriptSrcs.length).toBeGreaterThanOrEqual(3);
    for (const src of [...scriptSrcs, ...linkHrefs]) {
      expect(src).not.toMatch(/^(https?:)?\/\//);
    }

    // No inline <script> blocks, which script-src 'self' would block
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    expect(inlineScripts.filter((m) => m[1].trim().length > 0)).toHaveLength(0);
  });

  it('serves every referenced asset from the same origin', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs/').expect(200);
    const assets = [...res.text.matchAll(/(?:src|href)=['"]\.?\/?([^'"]+\.(?:js|css|png))['"]/g)].map(
      (m) => m[1].replace(/^.*\/api\/docs\//, ''),
    );
    expect(assets).toEqual(
      expect.arrayContaining(['swagger-ui-bundle.js', 'swagger-ui-init.js', 'swagger-ui.css']),
    );
    for (const asset of assets) {
      await request(app.getHttpServer()).get(`/api/docs/${asset}`).expect(200);
    }
  });

  it('applies a docs CSP that keeps script-src self and allows data: images', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs/').expect(200);
    const csp = cspDirectives(res.headers['content-security-policy']);

    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('img-src')).toEqual(["'self'", 'data:']);
    expect(csp.get('connect-src')).toEqual(
      expect.arrayContaining(["'self'", 'https://api.propchain.io']),
    );
  });

  it('keeps the strict default CSP on non-docs routes', async () => {
    const res = await request(app.getHttpServer()).get('/properties').expect(200);
    expect(res.headers['content-security-policy']).toBe(DEFAULT_CONTENT_SECURITY_POLICY);
  });
});

describe('swagger CSP helpers', () => {
  it('isSwaggerDocsPath matches the docs root, its assets and the JSON/YAML endpoints only', () => {
    expect(isSwaggerDocsPath('/api/docs')).toBe(true);
    expect(isSwaggerDocsPath('/api/docs/')).toBe(true);
    expect(isSwaggerDocsPath('/api/docs/swagger-ui-bundle.js')).toBe(true);
    expect(isSwaggerDocsPath('/api/docs-json')).toBe(true);
    expect(isSwaggerDocsPath('/api/docsx')).toBe(false);
    expect(isSwaggerDocsPath('/api/users')).toBe(false);
  });

  it('buildDocsContentSecurityPolicy dedupes origins and ignores relative URLs', () => {
    const csp = cspDirectives(
      buildDocsContentSecurityPolicy([
        'https://api.propchain.io/v2',
        'https://api.propchain.io',
        '/relative',
      ]),
    );
    expect(csp.get('connect-src')).toEqual(["'self'", 'https://api.propchain.io']);
  });
});
