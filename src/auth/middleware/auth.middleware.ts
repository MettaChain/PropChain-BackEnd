import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
@Injectable()
export class AuthRateLimitMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Apply rate limiting specifically to auth endpoints
    if (req.path.includes('/auth')) {
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Limit each IP to 5 requests per windowMs
        message: 'Too many authentication attempts, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
      });
      
      // Use 'as any' if the compiler still grumbles about the middleware signature
      return (limiter as any)(req, res, next);
    }
    
    next();
  }
}