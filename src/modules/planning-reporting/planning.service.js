import * as model from './planning.model.js';
import * as schedulingService from '../scheduling/index.js';
import * as repertoireService from '../repertoire/repertoire.service.js';
import * as recommendationService from '../recommendation/recommendation.service.js';
import * as performanceService from '../performance-history/performance.service.js';
import { sendDraftConfirmation } from '../../shared/email/mailer.js';
import prisma from '../../shared/db.js';

const DURATION_BY_DIFFICULTY = { 1: 120, 2: 180, 3: 240, 4: 300, 5: 360 };

function estimateDuration(difficulty) {
  return DURATION_BY_DIFFICULTY[difficulty] ?? 180;
}

function assertDraftActive(draft) {
  if (!draft || draft.deletedAt) {
    throw Object.assign(new Error('Draft not found'), { statusCode: 404 });
  }
}

function buildEnrichedResponse(draft, songs) {
  const songMap = new Map(songs.map((s) => [s.id, s]));
  const allIds = [...new Set([...draft.songIds, ...draft.manualAdditions])];

  const enrichedSongs = allIds
    .filter((id) => songMap.has(id))
    .map((id) => {
      const song = songMap.get(id);
      const duration = estimateDuration(song.difficulty);
      return { songId: song.id, title: song.title, duration, difficulty: song.difficulty };
    });

  const totalDuration = enrichedSongs.reduce((sum, s) => sum + s.duration, 0);

  return {
    id: draft.id,
    serviceId: draft.serviceId,
    serviceName: draft.service?.eventType?.name ?? null,
    serviceDate: draft.service?.date ?? null,
    songs: enrichedSongs,
    songCount: enrichedSongs.length,
    totalDuration,
    manualAdditions: draft.manualAdditions,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

export async function fetchService(serviceId) {
  const service = await schedulingService.getService(serviceId);
  const draft = await model.findActiveDraftByServiceId(serviceId);
  return {
    ...service,
    draft: draft ?? null,
  };
}

export async function createDraft(input) {
  const service = await schedulingService.getService(input.serviceId);
  const existing = await model.findDraftByServiceId(input.serviceId);

  if (existing) {
    if (existing.deletedAt) {
      const restored = await model.restoreDraft(existing.id, {
        songIds: [],
        manualAdditions: input.manualAdditions ?? [],
      });
      return restored;
    }
    throw Object.assign(new Error('Draft already exists for this service'), { statusCode: 409 });
  }

  try {
    return await model.createDraft({
      serviceId: input.serviceId,
      songIds: [],
      manualAdditions: input.manualAdditions ?? [],
    });
  } catch (err) {
    if (err.code === 'P2002' && err.meta?.modelName === 'PlanningDraft') {
      throw Object.assign(new Error('Draft already exists for this service'), { statusCode: 409 });
    }
    throw err;
  }
}

/**
 * Creates a planning draft pre-populated with the recommended song IDs, or
 * updates the existing draft's song list if one already exists. Used by the
 * weekly planning job so re-runs never create duplicate drafts.
 *
 * Manual additions are preserved on update — recommendations only ever own
 * the songIds list.
 */
export async function upsertDraftFromRecommendation({ serviceId, songIds }) {
  await schedulingService.getService(serviceId);

  const existing = await model.findDraftByServiceId(serviceId);
  if (existing) {
    if (existing.deletedAt) {
      return model.restoreDraft(existing.id, { songIds });
    }
    return model.updateDraft(existing.id, { songIds });
  }

  try {
    return await model.createDraft({
      serviceId,
      songIds,
      manualAdditions: [],
    });
  } catch (err) {
    if (err.code === 'P2002' && err.meta?.modelName === 'PlanningDraft') {
      const draft = await model.findDraftByServiceId(serviceId);
      if (!draft) throw err;
      if (draft.deletedAt) {
        return model.restoreDraft(draft.id, { songIds });
      }
      return model.updateDraft(draft.id, { songIds });
    }
    throw err;
  }
}

export async function addSongToDraft(draftId, songId) {
  await repertoireService.getSongById(songId);

  return prisma.$transaction(async (tx) => {
    const draft = await tx.planningDraft.findUnique({
      where: { id: draftId },
    });
    assertDraftActive(draft);

    if (draft.songIds.includes(songId)) {
      throw Object.assign(new Error('Song already in draft'), { statusCode: 409 });
    }

    const songIds = [...draft.songIds, songId];
    const manualAdditions = draft.manualAdditions.includes(songId)
      ? draft.manualAdditions
      : [...draft.manualAdditions, songId];

    return tx.planningDraft.update({
      where: { id: draftId },
      data: { songIds, manualAdditions },
    });
  });
}

export async function removeSongFromDraft(draftId, songId) {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.planningDraft.findUnique({
      where: { id: draftId },
    });
    assertDraftActive(draft);

    if (!draft.songIds.includes(songId)) {
      throw Object.assign(new Error('Song not found in draft'), { statusCode: 404 });
    }

    const songIds = draft.songIds.filter((id) => id !== songId);
    const manualAdditions = draft.manualAdditions.filter((id) => id !== songId);

    return tx.planningDraft.update({
      where: { id: draftId },
      data: { songIds, manualAdditions },
    });
  });
}

export async function getDraft(draftId) {
  const draft = await model.findDraftById(draftId);
  assertDraftActive(draft);

  const songs = await model.findSongsByIds(draft.songIds);
  return buildEnrichedResponse(draft, songs);
}

export async function deleteDraft(draftId) {
  const draft = await model.findDraftById(draftId);
  assertDraftActive(draft);
  return model.softDeleteDraft(draftId);
}

export async function listDrafts(filters) {
  const where = {};

  if (filters.serviceId) {
    where.serviceId = filters.serviceId;
  }

  if (filters.status === 'active') {
    where.deletedAt = null;
  } else if (filters.status === 'deleted') {
    where.deletedAt = { not: null };
  }

  if (filters.createdAfter || filters.createdBefore) {
    where.createdAt = {};
    if (filters.createdAfter) where.createdAt.gte = filters.createdAfter;
    if (filters.createdBefore) where.createdAt.lte = filters.createdBefore;
  }

  const { sortBy, sortOrder, page, limit } = filters;
  const skip = (page - 1) * limit;
  const take = limit;

  // TODO: songCount sort fetches all drafts in memory because songCount is computed
  // from the songIds array — not a DB column. Fine for seed data volumes, but will
  // need a materialised songCount column or similar if drafts/songs grow large.
  if (sortBy === 'songCount') {
    const allDrafts = await model.listDrafts({
      where,
      orderBy: { createdAt: 'asc' },
      skip: 0,
      take: undefined,
    });

    const allSongs = await model.findSongsByIds(
      allDrafts.flatMap((d) => d.songIds),
    );
    const songMap = new Map(allSongs.map((s) => [s.id, s]));

    const scored = allDrafts.map((d) => ({
      draft: d,
      songCount: d.songIds.filter((id) => songMap.has(id)).length,
    }));

    scored.sort((a, b) =>
      sortOrder === 'asc' ? a.songCount - b.songCount : b.songCount - a.songCount,
    );

    const total = scored.length;
    const paginated = scored.slice(skip, skip + take);

    return {
      drafts: paginated.map(({ draft }) => ({
        ...draft,
        songCount: draft.songIds.filter((id) => songMap.has(id)).length,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  const orderBy =
    sortBy === 'serviceDate'
      ? { service: { date: sortOrder } }
      : { createdAt: sortOrder };

  const [drafts, total] = await Promise.all([
    model.listDrafts({ where, orderBy, skip, take }),
    model.countDrafts(where),
  ]);

  const allSongs = await model.findSongsByIds(
    drafts.flatMap((d) => d.songIds),
  );
  const songMap = new Map(allSongs.map((s) => [s.id, s]));

  return {
    drafts: drafts.map((d) => ({
      ...d,
      songCount: d.songIds.filter((id) => songMap.has(id)).length,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function cloneDraft(draftId, targetServiceId) {
  const sourceDraft = await model.findDraftById(draftId);
  if (!sourceDraft || sourceDraft.deletedAt) {
    throw Object.assign(new Error('Source draft not found'), { statusCode: 404 });
  }

  await schedulingService.getService(targetServiceId);

  const existingTarget = await model.findDraftByServiceId(targetServiceId);
  if (existingTarget && !existingTarget.deletedAt) {
    throw Object.assign(new Error('Draft already exists for target service'), { statusCode: 409 });
  }

  if (existingTarget && existingTarget.deletedAt) {
    return model.restoreDraft(existingTarget.id, {
      songIds: sourceDraft.songIds,
      manualAdditions: sourceDraft.manualAdditions,
    });
  }

  try {
    return await model.createDraft({
      serviceId: targetServiceId,
      songIds: [...sourceDraft.songIds],
      manualAdditions: [...sourceDraft.manualAdditions],
    });
  } catch (err) {
    if (err.code === 'P2002' && err.meta?.modelName === 'PlanningDraft') {
      throw Object.assign(new Error('Draft already exists for target service'), { statusCode: 409 });
    }
    throw err;
  }
}

export async function clearDraft(draftId) {
  const draft = await model.findDraftById(draftId);
  assertDraftActive(draft);

  return model.updateDraftSongs(draftId, [], []);
}

async function sendConfirmationEmail({ draft, confirmedSongIds, service }) {
  try {
    const songs = await model.findSongsByIds(confirmedSongIds);
    const enrichedSongs = confirmedSongIds
      .map((id) => {
        const song = songs.find((s) => s.id === id);
        return song
          ? {
              songId: song.id,
              title: song.title,
              duration: estimateDuration(song.difficulty),
              difficulty: song.difficulty,
            }
          : null;
      })
      .filter(Boolean);

    const totalDuration = enrichedSongs.reduce((sum, s) => sum + s.duration, 0);

    await sendDraftConfirmation(service.createdBy.email, {
      serviceName: service.eventType?.name ?? 'Service',
      serviceDate: service.date,
      songs: enrichedSongs,
      totalDuration,
      choirName: service.createdBy?.name ?? 'Rehearsify',
      appLink: '#',
    });

    return { emailSent: true, emailError: null };
  } catch (err) {
    // Email is best-effort and sent AFTER the DB commit, so a failure here
    // must NOT roll back the confirmation (the critical writes already happened).
    console.error(
      `[confirmDraft] Confirmation email failed for draft ${draft.id}: ${err.message}`,
    );
    return { emailSent: false, emailError: err.message };
  }
}

/**
 * Confirms a draft and atomically:
 *  1. Fetches the latest recommendation for the draft's service.
 *  2. Locks the songs into Scheduling (service status -> CONFIRMED).
 *  3. Logs the draft's songs into Performance History.
 * All three happen inside ONE transaction — any failure rolls them all back.
 * The confirmation email is sent AFTER commit and never triggers a rollback.
 *
 * @param {string} draftId
 * @param {{ recommendationFetcher?: (serviceId: string) => Promise<object> }} [options]
 *   Injectable recommendation fetcher — lets tests simulate the recommendation
 *   endpoint being down or returning partial data.
 */
export async function confirmDraft(draftId, options = {}) {
  const fetchRecommendation =
    options.recommendationFetcher ?? recommendationService.getRecommendationsForService;

  const draft = await model.findDraftById(draftId);
  assertDraftActive(draft);

  // The draft's songs are the source of truth for what gets locked/confirmed.
  const confirmedSongIds = [...new Set([...draft.songIds, ...draft.manualAdditions])];

  const { service, recommendation } = await prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id: draft.serviceId },
      include: {
        eventType: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!service || service.deletedAt) {
      throw Object.assign(new Error('Service not found'), { statusCode: 404 });
    }
    if (service.status === 'CONFIRMED') {
      throw Object.assign(new Error('Service already confirmed'), { statusCode: 409 });
    }
    if (new Date(service.date).getTime() <= Date.now()) {
      throw Object.assign(
        new Error('Cannot confirm a service that has already taken place'),
        { statusCode: 400 },
      );
    }

    let recommendation;
    try {
      recommendation = await fetchRecommendation(service.id);
    } catch (err) {
      if (err && err.statusCode && err.statusCode < 500) throw err;
      throw Object.assign(new Error('Recommendation unavailable'), { statusCode: 502 });
    }

    // Conditional transition: only a service still in DRAFT can flip to
    // CONFIRMED. This closes the read-then-write race where two concurrent
    // confirms both pass the status check above — the first update wins,
    // the second affects 0 rows and conflicts.
    const updateResult = await tx.service.updateMany({
      where: { id: service.id, status: 'DRAFT' },
      data: { status: 'CONFIRMED' },
    });

    if (updateResult.count === 0) {
      throw Object.assign(new Error('Service already confirmed'), { statusCode: 409 });
    }

    if (confirmedSongIds.length > 0) {
      await performanceService.logPerformances(service.id, confirmedSongIds, tx);
    }

    return { service: { ...service, status: 'CONFIRMED' }, recommendation };
  });

  const { emailSent, emailError } = await sendConfirmationEmail({
    draft,
    confirmedSongIds,
    service,
  });

  return {
    success: true,
    draftId: draft.id,
    serviceId: draft.serviceId,
    confirmedSongIds,
    recommendation: recommendation ?? null,
    emailSent,
    emailError,
  };
}
