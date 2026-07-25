function notFound(req, res, next) {
  res.status(404).json({ error: 'Not Found', message: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'ValidationError', message: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'BadRequest', message: `Invalid id: ${err.value}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Conflict', message: 'Duplicate value', keyValue: err.keyValue });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.name || 'ServerError', message: err.message || 'Something went wrong' });
}

module.exports = { notFound, errorHandler };
