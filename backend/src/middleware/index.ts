/**
 * Middleware exports
 * 
 * Central export point for all middleware components.
 */

export { authenticate, requireRole, AuthRequest } from './auth';
export { validate, connectionIdSchema, dbSchema, keySchema, scanSchema } from './validate';
export { loginRateLimiter, setupRateLimiter } from './rateLimiter';
export {
  errorHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RedisConnectionError,
} from './errorHandler';
export { attributionMiddleware, AttributionHeaders, getExpectedHeaders } from './attribution';
export { 
  proxyHeadersMiddleware, 
  ProxyRequest, 
  getClientIp, 
  isProxiedRequest, 
  getProxyInfo 
} from './proxyHeaders';
