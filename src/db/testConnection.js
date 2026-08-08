// Quick standalone check: is the database actually reachable right now?
// Run with: npm run db:test
// Useful whenever setup breaks — confirms whether the problem is DB
// connectivity at all, before chasing anything more complicated.

import prisma from '../shared/db.js';

async function testConnection() {
    try {
        await prisma.$connect();
        console.log('Database connection successful.');

        const result = await prisma.$queryRaw`SELECT NOW()`;
        console.log('Query test passed. Database time:', result);
    } catch (err) {
        console.error('Database connection failed:', err);
        console.error(err.message);
        process.exit(1); // Exit with a failure code
    } finally {
        await prisma.$disconnect();
    }
}

testConnection();