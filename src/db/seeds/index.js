import { seedEventTypes } from './eventTypes.seed.js';
import { seedUsers } from './users.seed.js';
import { seedSongs } from './songs.seed.js';
import { seedServices } from './services.seed.js';
import {seedPerformances } from './performances.seed.js';

async function main() {
  await seedEventTypes();
  await seedUsers();
  await seedSongs();
  await seedServices();
  await seedPerformances();
  console.log('All seeding complete.');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});