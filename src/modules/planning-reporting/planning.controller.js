import * as service from './planning.service.js';

export async function fetchServiceHandler(req, res, next) {
  try {
    const result = await service.fetchService(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function createDraftHandler(req, res, next) {
  try {
    const result = await service.createDraft({
      serviceId: req.body.serviceId,
      manualAdditions: req.body.manualAdditions,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function addSongToDraftHandler(req, res, next) {
  try {
    const result = await service.addSongToDraft(
      req.params.draftId,
      req.params.songId,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function removeSongFromDraftHandler(req, res, next) {
  try {
    const result = await service.removeSongFromDraft(
      req.params.draftId,
      req.params.songId,
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getDraftHandler(req, res, next) {
  try {
    const result = await service.getDraft(req.params.draftId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteDraftHandler(req, res, next) {
  try {
    await service.deleteDraft(req.params.draftId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function listDraftsHandler(req, res, next) {
  try {
    const result = await service.listDrafts(req.query);
    res.json({ data: result.drafts, pagination: result.pagination });
  } catch (err) {
    next(err);
  }
}

export async function cloneDraftHandler(req, res, next) {
  try {
    const result = await service.cloneDraft(req.params.draftId, req.body.targetServiceId);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function clearDraftHandler(req, res, next) {
  try {
    const result = await service.clearDraft(req.params.draftId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function confirmDraftHandler(req, res, next) {
  try {
    const result = await service.confirmDraft(req.params.draftId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}
