import { Request, Response, NextFunction } from 'express';
import { adminAuth, isConfigured } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // In demo/offline mode where credentials are unconfigured or local demo token is provided
  if (!isConfigured || token.startsWith('demo-token-')) {
    req.user = {
      uid: 'demo-local-engineer',
      email: 'demo.engineer@enterprise.internal',
      name: 'Local Demo Engineer',
      picture: null,
      auth_time: Math.floor(Date.now() / 1000),
      iss: 'demo-issuer',
      aud: 'demo-audience',
      sub: 'demo-local-engineer',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      firebase: { identities: {}, sign_in_provider: 'custom' },
    } as any;
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1];

  if (!isConfigured || token.startsWith('demo-token-')) {
    req.user = {
      uid: 'demo-local-engineer',
      email: 'demo.engineer@enterprise.internal',
      name: 'Local Demo Engineer',
    } as any;
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
  } catch (error) {
    // Non-fatal for optional auth
  }
  next();
};
