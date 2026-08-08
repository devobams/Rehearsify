import prisma from '../../shared/db.js';

const eventTypes = [
  {
    name: 'Regular Sunday Service',
    description: 'Standard Sunday liturgical service',
    defaultMinSongs: 4,
    defaultMaxSongs: 6,
  },
  {
    name: 'Praise Night',
    description: 'Contemporary praise and worship focus',
    defaultMinSongs: 5,
    defaultMaxSongs: 8,
  },
  {
    name: 'Special Event',
    description: 'Weddings, funerals, concerts, special occasions',
    defaultMinSongs: 3,
    defaultMaxSongs: 12,
  },
];

export async function seedEventTypes() {
  for (const eventType of eventTypes) {
    const exists = await prisma.eventType.findUnique({
      where: { name: eventType.name },
    });

    if (!exists) {
      await prisma.eventType.create({ data: eventType });
      console.log(`Created EventType: ${eventType.name}`);
    } else {
      console.log(`EventType already exists: ${eventType.name}`);
    }
  }

  console.log('EventType seeding complete.');
  await prisma.$disconnect();
}
