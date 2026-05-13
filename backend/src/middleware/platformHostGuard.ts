import { NextFunction, Request, Response } from 'express';

const LOCAL_PLATFORM_HOSTS = new Set(['localhost', '127.0.0.1']);

const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

const configuredHosts = () =>
  (process.env.PLATFORM_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => normalizeHost(value))
    .filter(Boolean);

const candidateHosts = (req: Request) => {
  const values = [
    req.headers['x-forwarded-host'],
    req.headers.host,
    req.headers.origin,
    req.headers.referer,
  ];

  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeHost(value));
};

export const platformHostGuard = (req: Request, res: Response, next: NextFunction) => {
  const allowedHosts = configuredHosts();
  const requestHosts = candidateHosts(req);

  if (process.env.NODE_ENV !== 'production' && requestHosts.some((host) => LOCAL_PLATFORM_HOSTS.has(host))) {
    return next();
  }

  if (!allowedHosts.length) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        error: 'Platform access is not configured for this environment.',
      });
    }
    return next();
  }

  const allowed = requestHosts.some((host) => allowedHosts.includes(host));
  if (!allowed) {
    return res.status(404).json({ error: 'Not found' });
  }

  return next();
};