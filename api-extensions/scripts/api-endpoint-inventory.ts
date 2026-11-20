import * as fs from 'fs';
import * as path from 'path';
import { Project, SourceFile } from 'ts-morph';
import { getRepoRoot } from './lib/prisma-schema';

export interface EndpointInfo {
  module: string;
  controller: string;
  method: string;
  route: string;
  operationId: string;
  bodyDto?: string;
  queryDto?: string;
  paramDto?: string;
  guards: string[];
  authRequired: boolean;
  source: string;
  line: number;
}

export interface InventoryOptions {
  root: string;
  module?: string;
  method?: string;
  jsonPath: string;
  markdownPath: string;
  openApiPath: string;
}

const HTTP_DECORATORS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head'];
const AUTH_DECORATORS = [
  'UseGuards',
  'RequireVerifiedEmail',
  'RequireOwnership',
  'AllowIps',
  'ApiProtectedEndpoint',
  'ApiAdminEndpoint',
  'Roles',
  'Auth',
];

const USAGE = `API Endpoint Inventory Generator

Usage:
  ts-node api-extensions/scripts/api-endpoint-inventory.ts [options]

Options:
  --root <path>        Folder to scan (default: api-extensions)
  --module <name>      Only include a matching module directory
  --method <METHOD>    Only include one HTTP method (for example GET)
  --json <path>        JSON inventory path (default: api-extensions/reports/api-inventory.json)
  --markdown <path>    Markdown table path (default: api-extensions/reports/api-inventory.md)
  --openapi <path>     OpenAPI document path (default: api-extensions/reports/api-inventory.openapi.json)
  --help               Show this message
`;

export function parseInventoryOptions(argv: string[]): InventoryOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const option = (name: string, fallback?: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
  };
  return {
    root: option('--root', 'api-extensions') ?? 'api-extensions',
    module: option('--module'),
    method: option('--method')?.toUpperCase(),
    jsonPath:
      option('--json', 'api-extensions/reports/api-inventory.json') ??
      'api-extensions/reports/api-inventory.json',
    markdownPath:
      option('--markdown', 'api-extensions/reports/api-inventory.md') ??
      'api-extensions/reports/api-inventory.md',
    openApiPath:
      option('--openapi', 'api-extensions/reports/api-inventory.openapi.json') ??
      'api-extensions/reports/api-inventory.openapi.json',
  };
}

export function buildInventory(rootDir: string): EndpointInfo[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFiles = project.addSourceFilesAtPaths(path.join(rootDir, '**', '*.controller.ts'));
  const endpoints: EndpointInfo[] = [];

  for (const sourceFile of sourceFiles) {
    endpoints.push(...inventoryForFile(sourceFile, rootDir));
  }
  return endpoints.sort((left, right) =>
    `${left.route}${left.method}`.localeCompare(`${right.route}${right.method}`),
  );
}

function inventoryForFile(sourceFile: SourceFile, rootDir: string): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  const controllerClass = sourceFile.getClasses().find((item) => item.getDecorator('Controller'));
  if (!controllerClass) return endpoints;
  const controllerDecorator = controllerClass.getDecorator('Controller');
  if (!controllerDecorator) return endpoints;

  const controllerPath = decoratorStringArgument(controllerDecorator.getArguments()[0]) ?? '';
  const moduleName = path.basename(path.dirname(sourceFile.getFilePath()));
  const relativeSource = path.relative(rootDir, sourceFile.getFilePath());

  for (const controller of sourceFile.getClasses()) {
    const classGuards = guardNames(
      controller.getDecorators().map((decorator) => decorator.getName()),
    );

    for (const method of controller.getMethods()) {
      for (const decorator of method.getDecorators()) {
        const name = decorator.getName();
        if (!HTTP_DECORATORS.includes(name)) continue;
        const methodPath = decoratorStringArgument(decorator.getArguments()[0]) ?? '';
        const guards = Array.from(
          new Set([
            ...classGuards,
            ...guardNames(method.getDecorators().map((item) => item.getName())),
          ]),
        );
        const bodyParam = method
          .getParameters()
          .find((parameter) => parameter.getDecorator('Body'));
        const queryParam = method
          .getParameters()
          .find((parameter) => parameter.getDecorator('Query'));
        const paramParam = method
          .getParameters()
          .find((parameter) => parameter.getDecorator('Param'));
        const route = openApiPath(`${controllerPath}/${methodPath}`);
        const httpMethod = name.toUpperCase();

        endpoints.push({
          module: moduleName,
          controller: controller.getName() ?? 'AnonymousController',
          method: httpMethod,
          route,
          operationId: `${httpMethod.toLowerCase()}_${route.replace(/[^a-zA-Z0-9]+/g, '_')}`,
          bodyDto: bodyParam?.getTypeNode()?.getText(),
          queryDto: queryParam?.getTypeNode()?.getText(),
          paramDto: paramParam?.getTypeNode()?.getText(),
          guards,
          authRequired: guards.length > 0,
          source: relativeSource,
          line: method.getStartLineNumber(),
        });
      }
    }
  }
  return endpoints;
}

function decoratorStringArgument(argument: { getText(): string } | undefined): string | undefined {
  if (!argument) return undefined;
  const text = argument.getText().trim();
  if (/^['"`]/.test(text)) return text.slice(1, -1);
  return undefined;
}

function guardNames(names: string[]): string[] {
  return names.filter((name) => AUTH_DECORATORS.includes(name));
}

function openApiPath(route: string): string {
  const collapsed = route.replace(/\/{2,}/g, '/');
  const normalised = collapsed.replace(/:([A-Za-z_]\w*)/g, '{$1}');
  return normalised.startsWith('/') ? normalised : `/${normalised}`;
}

export function buildOpenApi(endpoints: EndpointInfo[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas = new Set<string>();
  for (const endpoint of endpoints) {
    const operation: Record<string, unknown> = {
      tags: [endpoint.module],
      operationId: endpoint.operationId,
      responses: { '200': { description: 'Successful response' } },
      security: endpoint.authRequired ? [{ bearerAuth: [] }] : [],
    };
    if (endpoint.bodyDto && !endpoint.bodyDto.includes(' ')) {
      schemas.add(endpoint.bodyDto);
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${endpoint.bodyDto}` },
          },
        },
      };
    }
    paths[endpoint.route] = {
      ...(paths[endpoint.route] ?? {}),
      [endpoint.method.toLowerCase()]: operation,
    };
  }

  return {
    openapi: '3.0.3',
    info: { title: 'PropChain API Extensions', version: '1.0.0' },
    tags: Array.from(new Set(endpoints.map((endpoint) => endpoint.module))).map((name) => ({
      name,
    })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: Object.fromEntries(Array.from(schemas).map((name) => [name, { type: 'object' }])),
    },
  };
}

export function renderMarkdown(endpoints: EndpointInfo[]): string {
  const lines = [
    '# API Endpoint Inventory',
    '',
    `Total endpoints: ${endpoints.length}`,
    '',
    '| Module | Method | Route | DTOs | Guards | Auth | Source |',
    '|--------|--------|-------|------|--------|------|--------|',
  ];
  for (const endpoint of endpoints) {
    const dto =
      [endpoint.bodyDto, endpoint.queryDto, endpoint.paramDto].filter(Boolean).join(', ') || '-';
    const guards = endpoint.guards.join(', ') || '-';
    lines.push(
      `| ${endpoint.module} | ${endpoint.method} | \`${endpoint.route}\` | ${dto} | ${guards} | ` +
        `${endpoint.authRequired ? 'yes' : 'no'} | ${endpoint.source}:${endpoint.line} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function write(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  process.stdout.write(`Wrote ${target}\n`);
}

export function main(argv = process.argv.slice(2)): EndpointInfo[] {
  const options = parseInventoryOptions(argv);
  const repoRoot = getRepoRoot();
  const scanRoot = path.resolve(repoRoot, options.root);
  const all = buildInventory(scanRoot);
  const endpoints = all.filter(
    (endpoint) =>
      (!options.module || endpoint.module === options.module) &&
      (!options.method || endpoint.method === options.method),
  );

  write(path.resolve(repoRoot, options.jsonPath), JSON.stringify(endpoints, null, 2));
  write(path.resolve(repoRoot, options.markdownPath), renderMarkdown(endpoints));
  write(
    path.resolve(repoRoot, options.openApiPath),
    JSON.stringify(buildOpenApi(endpoints), null, 2),
  );
  process.stdout.write(`Endpoints discovered: ${all.length}, exported: ${endpoints.length}\n`);
  return endpoints;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Inventory generation failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}
