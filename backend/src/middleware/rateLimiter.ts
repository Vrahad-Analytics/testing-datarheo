import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Generous in development: the UI polls job/pipeline status every few seconds.
  max: isDev ? 5000 : 300,
  message: { success: false, error: { message: 'Too many requests, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 200 : 20,
  message: { success: false, error: { message: 'Too many authentication attempts, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});
