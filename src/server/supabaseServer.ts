import { createSupabaseContext, type SupabaseContext } from '@supabase/server';
import { createAdminClient, type CreateAdminClientOptions } from '@supabase/server/core';
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';

export interface ExtendedExpressRequest extends ExpressRequest {
  supabaseContext?: SupabaseContext;
}

/**
 * Converts an Express request into a web standard Request object for @supabase/server
 */
export function expressRequestToWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  const url = `${protocol}://${host}${req.originalUrl || req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody && req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : undefined;

  return new Request(url, {
    method,
    headers,
    body,
  });
}

/**
 * Authenticates and creates a Supabase context from an incoming Express or Web request.
 * Automatically verifies JWTs and sets up user-scoped and admin supabase clients.
 */
export async function authenticateServerRequest(
  req: ExpressRequest | Request,
  options: {
    auth?: 'user' | 'publishable' | 'secret' | 'none';
  } = { auth: 'user' }
) {
  const webReq = 'headers' in req && typeof (req as any).get === 'function'
    ? expressRequestToWebRequest(req as ExpressRequest)
    : (req as Request);

  return await createSupabaseContext(webReq, {
    auth: options.auth || 'user',
  });
}

/**
 * Express middleware for verifying Supabase users and injecting the Supabase context.
 * 
 * Usage:
 *   app.use('/api/protected', requireSupabaseUser);
 *   app.get('/api/protected/profile', (req, res) => {
 *     const user = req.supabaseContext?.user;
 *     const client = req.supabaseContext?.supabase;
 *     ...
 *   });
 */
export function requireSupabaseAuth(
  mode: 'user' | 'publishable' | 'secret' | 'none' = 'user'
) {
  return async (req: ExtendedExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const { data: ctx, error } = await authenticateServerRequest(req, { auth: mode });

      if (error || !ctx) {
        return res.status(error?.status || 401).json({
          error: error?.message || 'Unauthorized: Invalid or missing Supabase credentials',
          code: error?.code || 'AUTH_ERROR',
        });
      }

      // Attach context with user, supabase client, and admin client to the request
      req.supabaseContext = ctx;
      next();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication verification failed';
      return res.status(500).json({ error: message });
    }
  };
}

/**
 * Creates an admin client using the configured secret key / service role key
 */
export function getAdminClient(options?: CreateAdminClientOptions) {
  return createAdminClient(options);
}

export { createSupabaseContext, createAdminClient };
