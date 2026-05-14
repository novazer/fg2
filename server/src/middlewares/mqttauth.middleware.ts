import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { MQTTAUTH_SHARED_SECRET } from '@config';
import { logger } from '@utils/logger';

export const mqttAuthSecretMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const expected = MQTTAUTH_SHARED_SECRET;
  if (!expected) {
    logger.error('MQTTAUTH_SHARED_SECRET is not configured; rejecting /mqttauth request');
    res.status(500).send('deny');
    return;
  }

  const provided = req.params.secret;
  if (typeof provided !== 'string') {
    res.status(401).send('deny');
    return;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).send('deny');
    return;
  }

  next();
};
