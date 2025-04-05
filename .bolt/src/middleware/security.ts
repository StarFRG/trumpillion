import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Express } from 'express';

export const configureSecurityMiddleware = (app: Express) => {
  // Basic security headers
  app.use(helmet());

  // CSRF Protection
  app.use((req, res, next) => {
    res.setHeader('X-CSRF-Token', req.csrfToken());
    next();
  });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', limiter);

  // Additional security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
};