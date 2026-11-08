import { and, eq, exists, inArray, or } from 'drizzle-orm';
import type { DbOrTx } from '../../database/database.module.js';
import { suggestionMatchCandidates, suggestions } from '../../database/schema.js';

/**
 * Suggestions that need the user's decision: new/updated cases, plus "nothing new" captures
 * that might belong to one of several existing cases (ambiguous matches).
 */
export function needsReview(db: DbOrTx, userId: string) {
  return and(
    eq(suggestions.userId, userId),
    eq(suggestions.status, 'PENDING'),
    or(
      inArray(suggestions.kind, ['NEW_CASE', 'UPDATE_CASE']),
      exists(db.select({ x: suggestionMatchCandidates.id }).from(suggestionMatchCandidates).where(eq(suggestionMatchCandidates.suggestionId, suggestions.id))),
    ),
  );
}
