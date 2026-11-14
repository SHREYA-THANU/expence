/**
 * Central Error-Handling & 404 Middleware
 */

function notFoundHandler(req, res, next) {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.originalUrl}`
    });
  }
  next();
}

function errorHandler(err, req, res, next) {
  console.error('Unhandled server error:', err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
