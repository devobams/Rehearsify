// Creates and configures the Express app but does NOT start listening.
// This separation matters for testing: tests import `app` and use supertest
// against it directly, without needing a real running server on a real port.

import express from 'express';
import routes from './routes/index.js';
import errorHandler from './shared/middleware/errorHandler.js';

const app = express();

// middleware to parse incoming JSON requests and put the parsed data in req.body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/api', routes);

// Error handler must be registered LAST — Express only treats a middleware
// as an error handler if it has exactly 4 params (err, req, res, next).
app.use(errorHandler);

export default app;