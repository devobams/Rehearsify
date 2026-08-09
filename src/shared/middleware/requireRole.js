// Rejects requests from users whose role isn't in the allowed list.
// Usage: router.post('/songs', requireAuth, requireRole('ADMINISTRATOR', 'CHOIR_DIRECTOR'), handler)
// Must run AFTER requireAuth, since it reads req.user.id.
//
// The role is loaded LIVE from the database rather than trusted from the JWT
// claim so that a role change (e.g. a director demoted to chorister) takes
// effect immediately, and a token whose role claim doesn't match the store
// (forged, or issued before a demotion) can't escalate privileges.

import prisma from '../db.js';

export default function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    // check req.user exists (requireAuth ran first)
    if (!req.user) {
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      return next(err);
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true },
      });

      // User no longer exists (deleted) -> treat as unauthenticated.
      if (!user) {
        const err = new Error("Unauthorized");
        err.statusCode = 401;
        return next(err);
      }

      if (!allowedRoles.includes(user.role)) {
        const err = new Error("Forbidden");
        err.statusCode = 403;
        return next(err);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}