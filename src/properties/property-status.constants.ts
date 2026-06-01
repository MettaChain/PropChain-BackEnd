import { PropertyStatus } from '../types/prisma.types';

/**
 * Default status assigned when a property is created.
 */
export const DEFAULT_PROPERTY_STATUS = PropertyStatus.PENDING;

/**
 * Property status workflow state machine.
 *
 * Happy path (acceptance):
 *   DRAFT → PENDING → ACTIVE → UNDER_CONTRACT → SOLD
 *
 * Additional reasonable transitions:
 *   - PENDING → DRAFT          (back to draft for revisions)
 *   - UNDER_CONTRACT → ACTIVE  (deal fell through, relist)
 *   - ACTIVE → RENTED          (rented out)
 *   - RENTED → ACTIVE          (lease ended)
 *   - any non-terminal → ARCHIVED
 *   - ARCHIVED → DRAFT         (un-archive for re-listing)
 *   - EXPIRED → ACTIVE/DRAFT   (renewal)
 *   - EXPIRED → ARCHIVED       (archive expired listing)
 *
 * Terminal-ish states (SOLD) only allow ARCHIVED for record-keeping.
 */
const ALLOWED_PROPERTY_STATUS_TRANSITIONS: Record<PropertyStatus, readonly PropertyStatus[]> = {
  [PropertyStatus.DRAFT]: [PropertyStatus.PENDING, PropertyStatus.ARCHIVED, PropertyStatus.EXPIRED],
  [PropertyStatus.PENDING]: [PropertyStatus.ACTIVE, PropertyStatus.DRAFT, PropertyStatus.ARCHIVED, PropertyStatus.EXPIRED],
  [PropertyStatus.ACTIVE]: [
    PropertyStatus.UNDER_CONTRACT,
    PropertyStatus.RENTED,
    PropertyStatus.ARCHIVED,
    PropertyStatus.EXPIRED,
  ],
  [PropertyStatus.UNDER_CONTRACT]: [PropertyStatus.SOLD, PropertyStatus.ACTIVE],
  [PropertyStatus.SOLD]: [PropertyStatus.ARCHIVED],
  [PropertyStatus.RENTED]: [PropertyStatus.ACTIVE, PropertyStatus.ARCHIVED],
  [PropertyStatus.ARCHIVED]: [PropertyStatus.DRAFT],
  [PropertyStatus.EXPIRED]: [PropertyStatus.ACTIVE, PropertyStatus.DRAFT, PropertyStatus.ARCHIVED],
};

/**
 * Returns true if `currentStatus` may transition to `nextStatus`.
 * No-op transitions (current === next) are allowed for idempotency.
 */
export function canTransitionPropertyStatus(
  currentStatus: PropertyStatus,
  nextStatus: PropertyStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }
  return ALLOWED_PROPERTY_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

/**
 * Returns the list of statuses reachable from `currentStatus` (excluding itself).
 * Useful for UI hints ("what actions are available now").
 */
export function getAllowedNextPropertyStatuses(
  currentStatus: PropertyStatus,
): readonly PropertyStatus[] {
  return ALLOWED_PROPERTY_STATUS_TRANSITIONS[currentStatus];
}
