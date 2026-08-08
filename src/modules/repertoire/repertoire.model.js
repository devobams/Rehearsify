// Only file in repertoire allowed to import prisma directly.
// Follow the pattern in auth.model.js.

import prisma from '../../shared/db.js';

// create new song
export async function createSong(data) {
    return prisma.song.create({ data });
}

export async function findSongs({season, voicing, difficulty, active=true} = {}) {
    return prisma.song.findMany({
        where: {
            ...(season && {season}),
            ...(voicing && {voicing}),
            ...(difficulty && {difficulty}),
            active,
        },
        orderBy: { title: 'asc' },
    })

}


export async function findSongById(id) {
    return prisma.song.findUnique({ where: { id } });
}

export async function findSongByTitleAndComposer(title, composer) {
    return prisma.song.findFirst({ where: { title, composer } });
}

export async function updateSong(id, data) {
    return prisma.song.update({ where: { id }, data });
}

export async function softDeleteSong(id) {
    return prisma.song.update({
        where: { id },
        data: { active: false},
    });
}
