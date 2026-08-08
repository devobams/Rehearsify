// Seeds a realistic spread of songs across seasons and difficulty levels.
// Idempotent: checks title+composer before creating, so re-running this
// (or the full `npx prisma db seed`) never produces duplicates.

import prisma from '../../shared/db.js';

const songs = [
  { title: 'Come Thou Long Expected Jesus', composer: 'Charles Wesley', voicing: 'SATB', difficulty: 2, season: 'ADVENT', language: 'English' },
  { title: 'O Come, O Come, Emmanuel', composer: 'Traditional', voicing: 'SATB', difficulty: 1, season: 'ADVENT', language: 'English' },
  { title: 'Hark! The Herald Angels Sing', composer: 'Felix Mendelssohn', voicing: 'SATB', difficulty: 2, season: 'CHRISTMAS', language: 'English' },
  { title: 'O Holy Night', composer: 'Adolphe Adam', voicing: 'SATB', difficulty: 4, season: 'CHRISTMAS', language: 'English' },
  { title: 'Joy to the World', composer: 'George Frideric Handel', voicing: 'SATB', difficulty: 2, season: 'CHRISTMAS', language: 'English' },
  { title: 'Were You There', composer: 'Traditional Spiritual', voicing: 'SATB', difficulty: 3, season: 'LENT', language: 'English' },
  { title: 'What Wondrous Love Is This', composer: 'Traditional', voicing: 'SAB', difficulty: 2, season: 'LENT', language: 'English' },
  { title: 'Ah, Holy Jesus', composer: 'Johann Crüger', voicing: 'SATB', difficulty: 3, season: 'LENT', language: 'English' },
  { title: 'Christ the Lord Is Risen Today', composer: 'Charles Wesley', voicing: 'SATB', difficulty: 2, season: 'EASTER', language: 'English' },
  { title: 'Thine Is the Glory', composer: 'George Frideric Handel', voicing: 'SATB', difficulty: 3, season: 'EASTER', language: 'English' },
  { title: 'Because He Lives', composer: 'Bill Gaither', voicing: 'SATB', difficulty: 2, season: 'EASTER', language: 'English' },
  { title: 'Come, Holy Ghost', composer: 'Traditional', voicing: 'SATB', difficulty: 3, season: 'PENTECOST', language: 'English' },
  { title: 'Spirit of the Living God', composer: 'Daniel Iverson', voicing: 'Unison', difficulty: 1, season: 'PENTECOST', language: 'English' },
  { title: 'Great Is Thy Faithfulness', composer: 'Thomas Chisholm', voicing: 'SATB', difficulty: 2, season: 'ORDINARY', language: 'English' },
  { title: 'How Great Thou Art', composer: 'Stuart K. Hine', voicing: 'SATB', difficulty: 3, season: 'ORDINARY', language: 'English' },
  { title: 'It Is Well with My Soul', composer: 'Philip Bliss', voicing: 'SATB', difficulty: 3, season: 'ORDINARY', language: 'English' },
  { title: 'Blessed Assurance', composer: 'Phoebe Knapp', voicing: 'SATB', difficulty: 2, season: 'ORDINARY', language: 'English' },
  { title: 'Amazing Grace', composer: 'John Newton', voicing: 'SATB', difficulty: 1, season: 'ORDINARY', language: 'English' },
  { title: 'In Christ Alone', composer: 'Keith Getty', voicing: 'SATB', difficulty: 4, season: 'ORDINARY', language: 'English' },
  { title: 'Way Maker', composer: 'Sinach', voicing: 'SATB', difficulty: 3, season: 'ORDINARY', language: 'English' },
];

export async function seedSongs() {
  for (const song of songs) {
    const exists = await prisma.song.findFirst({
      where: { title: song.title, composer: song.composer },
    });

    if (!exists) {
      await prisma.song.create({ data: song });
      console.log(`Created Song: ${song.title}`);
    } else {
      console.log(`Song already exists: ${song.title}`);
    }
  }

  console.log('Song seeding complete.');
}