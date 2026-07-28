// @ts-nocheck

import { Injectable } from '@nestjs/common';
import { Plugin } from '@nestjs/apollo';
import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { getComplexity, simpleEstimator, fieldExtensionsEstimator } from 'graphql-query-complexity';
import { AuthService } from './auth.service';
import { GRAPHQL_COMPLEXITY_LIMITS } from './rate-limit.config';

/**
 * Rejects GraphQL operations whose estimated query complexity exceeds the
 * caller's tier limit. Complexity (not just depth/field count) protects
 * against expensive nested/paginated queries that a naive per-request rate
 * limit wouldn't catch, since a single GraphQL call can fan out into an
 * arbitrary amount of resolver work.
 *
 * Runs as an Apollo plugin (didResolveOperation) rather than a static
 * validation rule because validation rules don't have access to operation
 * variables, which we need for accurate complexity estimates on paginated
 * fields (e.g. `posts(limit: 100)`).
 */
@Plugin()
@Injectable()
export class GraphqlComplexityPlugin implements ApolloServerPlugin {
  constructor(private readonly authService: AuthService) {}

  private async resolveTier(req: any): Promise<keyof typeof GRAPHQL_COMPLEXITY_LIMITS> {
    const authHeader: string | undefined = req?.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return 'anonymous';
    }

    try {
      const token = authHeader.slice('Bearer '.length);
      const authUser = await this.authService.validateAccessToken(token);
      // Field-level GqlAuthGuard hasn't run yet at this point in the Apollo
      // lifecycle, so we validate the token here directly rather than
      // relying on request.authUser being populated already. Stash the
      // result on the request so the guard can reuse it instead of
      // validating the same token twice.
      req.authUser = authUser;

      if (authUser.type === 'api-key') {
        return 'apiKey';
      }
      const tier = (authUser.tier || 'FREE').toLowerCase();
      return tier in GRAPHQL_COMPLEXITY_LIMITS
        ? (tier as keyof typeof GRAPHQL_COMPLEXITY_LIMITS)
        : 'free';
    } catch {
      // Invalid/expired token: don't fail the complexity check itself here,
      // field-level auth guards are responsible for rejecting bad tokens.
      // Just don't grant elevated complexity headroom for it.
      return 'anonymous';
    }
  }

  async requestDidStart(): Promise<GraphQLRequestListener<any>> {
    return {
      didResolveOperation: async ({ request, document, schema, contextValue }) => {
        const req = (contextValue as any)?.req;
        const tier = await this.resolveTier(req);
        const maximumComplexity = GRAPHQL_COMPLEXITY_LIMITS[tier];

        const complexity = getComplexity({
          schema,
          operationName: request.operationName,
          query: document,
          variables: request.variables || {},
          estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
        });

        if (complexity > maximumComplexity) {
          throw new GraphQLError(
            `Query complexity ${complexity} exceeds the maximum allowed complexity of ${maximumComplexity} for your tier.`,
            {
              extensions: {
                code: 'QUERY_COMPLEXITY_EXCEEDED',
                complexity,
                maximumComplexity,
                tier,
              },
            },
          );
        }
      },
    };
  }
}
