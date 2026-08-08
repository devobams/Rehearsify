// Verifies a JWT is present and valid, attaches the decoded user to req.user.
// Owned by the Auth & Access module (AUTH-2 in the PRD).
// Every other module's routes file imports this and applies it to protected routes.

import jwt from 'jsonwebtoken';
import config from '../../config/index.js';

export default function requireAuth(req, res, next) {
  // extract Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    return next(err);
  }
  // verify with jsonwebtoken, attach decoded payload to req.user
  const token = authHeader.slice('Bearer '.length);

  // try to verify token
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    // if token is valid, attach decoded payload to req.user
    req.user = {id: decoded.sub, role: decoded.role};
    // move on  
    return next();
  } catch (err) {
    const authError = new Error("Unauthorized");
    authError.statusCode = 401;
    return next(authError);
  }
}