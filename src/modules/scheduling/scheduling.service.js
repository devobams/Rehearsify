// Business logic and public API for scheduling.
// Other modules call functions exported from HERE, never from scheduling.model.js.
// Follow the pattern in auth.service.js.

import * as model from './scheduling.model.js';
import { createServiceSchema, createMergedUpdateSchema } from './validators.js';

const AUTHORIZED_ROLES = new Set(['ADMINISTRATOR', 'CHOIR_DIRECTOR']);

function assertAuthorized(service, actor) {
  if (service.createdById === actor.id) return;
  if (AUTHORIZED_ROLES.has(actor.role)) return;
  throw Object.assign(new Error('Not authorized to modify this service'), { statusCode: 403 });
}

export async function createService(input) {
  const validated = createServiceSchema.parse(input);

  const eventType = await model.findEventTypeById(validated.eventTypeId);
  if (!eventType) {
    throw Object.assign(new Error('EventType not found'), { statusCode: 404 });
  }

  return model.createService({
    eventTypeId: validated.eventTypeId,
    date: validated.date,
    season: validated.season,
    minSongCount: validated.minSongCount ?? null,
    maxSongCount: validated.maxSongCount ?? null,
    createdById: input.createdById,
  });
}

export async function getService(serviceId, options = {}) {
  const service = await model.findServiceById(serviceId, options);
  if (!service || service.deletedAt) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }
  return service;
}

export async function listServices(filters) {
  return model.listServices(filters);
}

export async function updateService(serviceId, updates, actor) {
  const service = await model.findServiceById(serviceId);
  if (!service || service.deletedAt) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }
  assertAuthorized(service, actor);
  const schema = createMergedUpdateSchema(service);
  const validated = schema.parse(updates);
  return model.updateService(serviceId, validated);
}

export async function deleteService(serviceId, actor) {
  const service = await model.findServiceById(serviceId);
  if (!service || service.deletedAt) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }
  assertAuthorized(service, actor);
  return model.softDeleteService(serviceId);
}

export async function updateServiceStatus(serviceId, newStatus, actor) {
  const service = await model.findServiceById(serviceId);
  if (!service || service.deletedAt) {
    throw Object.assign(new Error('Service not found'), { statusCode: 404 });
  }
  assertAuthorized(service, actor);
  if (service.status === 'CONFIRMED') {
    throw Object.assign(new Error('Cannot change status of a confirmed service'), { statusCode: 400 });
  }
  if (newStatus !== 'CONFIRMED') {
    throw Object.assign(new Error('Only CONFIRMED is a valid status transition from DRAFT'), { statusCode: 400 });
  }
  return model.updateService(serviceId, { status: 'CONFIRMED' });
}

export async function getDraftServicesWithinDays(days) {
  return model.findDraftServicesWithinDays(days);
}
