// The ONE PrismaClient instance for the whole app.
// Every module's *.model.js file imports `prisma` from here.
// Never write `new PrismaClient()` anywhere else — multiple instances
// exhaust the Postgres connection pool.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;