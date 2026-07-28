import { buildSchema, parse } from 'graphql';
import { GraphqlComplexityPlugin } from './graphql-complexity.plugin';

describe('GraphqlComplexityPlugin', () => {
  const schema = buildSchema(`
    type Item {
      a: String
      b: String
      c: String
    }
    type Query {
      items: [Item]
    }
  `);

  function makeAuthService(validateAccessToken: jest.Mock) {
    return { validateAccessToken } as any;
  }

  function buildQuery(aliasCount: number) {
    const aliases = Array.from({ length: aliasCount }, (_, i) => `i${i}: items { a b c }`).join(
      '\n',
    );
    return parse(`query { ${aliases} }`);
  }

  it('allows a query within the anonymous tier limit (no auth header)', async () => {
    const plugin = new GraphqlComplexityPlugin(makeAuthService(jest.fn()));
    const listener = await plugin.requestDidStart();

    await expect(
      listener.didResolveOperation!({
        request: { operationName: undefined, variables: {} },
        document: buildQuery(1),
        schema,
        contextValue: { req: { headers: {} } },
      } as any),
    ).resolves.toBeUndefined();
  });

  it('rejects a query over the anonymous tier limit', async () => {
    const plugin = new GraphqlComplexityPlugin(makeAuthService(jest.fn()));
    const listener = await plugin.requestDidStart();

    await expect(
      listener.didResolveOperation!({
        request: { operationName: undefined, variables: {} },
        document: buildQuery(20),
        schema,
        contextValue: { req: { headers: {} } },
      } as any),
    ).rejects.toThrow(/exceeds the maximum allowed complexity/);
  });

  it('grants a higher limit for an authenticated premium-tier request', async () => {
    const validateAccessToken = jest.fn().mockResolvedValue({
      sub: 'user-1',
      tier: 'PREMIUM',
      type: 'access',
    });
    const plugin = new GraphqlComplexityPlugin(makeAuthService(validateAccessToken));
    const listener = await plugin.requestDidStart();

    const req: any = { headers: { authorization: 'Bearer valid-token' } };

    await expect(
      listener.didResolveOperation!({
        request: { operationName: undefined, variables: {} },
        document: buildQuery(20),
        schema,
        contextValue: { req },
      } as any),
    ).resolves.toBeUndefined();

    expect(validateAccessToken).toHaveBeenCalledWith('valid-token');
    expect(req.authUser.tier).toBe('PREMIUM');
  });

  it('falls back to the anonymous limit when the token is invalid', async () => {
    const validateAccessToken = jest.fn().mockRejectedValue(new Error('bad token'));
    const plugin = new GraphqlComplexityPlugin(makeAuthService(validateAccessToken));
    const listener = await plugin.requestDidStart();

    await expect(
      listener.didResolveOperation!({
        request: { operationName: undefined, variables: {} },
        document: buildQuery(20),
        schema,
        contextValue: { req: { headers: { authorization: 'Bearer garbage' } } },
      } as any),
    ).rejects.toThrow(/exceeds the maximum allowed complexity/);
  });
});
