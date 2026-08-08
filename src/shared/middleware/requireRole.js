// Rejects requests from users whose role isn't in the allowed list.
// Usage: router.post('/songs', requireAuth, requireRole('ADMINISTRATOR', 'CHOIR_DIRECTOR'), handler)
// Must run AFTER requireAuth, since it reads req.user.role.

export default function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // check req.user exists (requireAuth ran first)
    if (!req.user){
      const err = new Error("Unauthorized");
      err.statusCode = 401;
      return next(err);
    }
    //check req.user.role is in allowedRoles
    if (!allowedRoles.includes(req.user.role)){
      const err = new Error("Forbidden");
      err.statusCode = 403;
      return next(err);
    }
    next();
  };
}