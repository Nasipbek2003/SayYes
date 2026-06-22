/**
 * Repository barrel.
 *
 * Re-exports each data-access module under a namespace so callers can write
 * `invitationRepo.create(...)`, `responseRepo.upsertResponse(...)`, etc.
 */
export * as invitationRepo from './invitations';
export * as responseRepo from './responses';
export * as openEventRepo from './openEvents';
export * as paymentRepo from './payments';
export * as outboxRepo from './notificationOutbox';
export * as authorRepo from './authors';
export * as magicLinkRepo from './magicLinks';
