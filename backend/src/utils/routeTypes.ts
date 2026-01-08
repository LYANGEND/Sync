/**
 * This file exports typed route handlers that work with Express routes.
 * It provides type-safe wrappers for tenant-aware controllers.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { TenantRequest } from './tenantContext';

/**
 * Type assertion helper that wraps a TenantRequest handler to work with Express routes.
 * This is needed because Express expects RequestHandler<...> but our controllers use TenantRequest.
 */
export function tenantHandler(
    handler: (req: TenantRequest, res: Response, next?: NextFunction) => any
): RequestHandler {
    return handler as unknown as RequestHandler;
}

/**
 * For routes that don't need tenant context (like public routes)
 */
export function publicHandler(
    handler: (req: Request, res: Response, next?: NextFunction) => any
): RequestHandler {
    return handler as RequestHandler;
}
