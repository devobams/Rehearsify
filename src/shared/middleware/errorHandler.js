// Single place where every thrown/passed error becomes a consistent JSON response.
// Per the Build Guide's Definition of Done: "Error responses follow the shared,
// consistent format" — this file IS that format, applied once in app.js.

export default function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.statusCode || 500;
  const message = err.message || 'Something went wrong';

  res.status(status).json({
    error: {
      message,
      status,
    },
  });
}