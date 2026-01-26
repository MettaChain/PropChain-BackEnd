import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit'; // Fixed import

@Injectable()
export class AuthRateLimitMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Apply rate limiting specifically to auth endpoints
    if (req.path.includes('/auth')) {
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Limit each IP to 5 requests per windowMs
        message: {
          statusCode: 429,
          message: 'Too many authentication attempts, please try again later.',
          error: 'Too Many Requests'
        },
        standardHeaders: true,
        legacyHeaders: false,
      });
      
      // Note: In Nest middleware, rateLimit returns a standard middleware function
      return limiter(req, res, next);
    }
    
    next();
  }
}