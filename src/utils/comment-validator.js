/**
 * Comment Position Validator
 *
 * Validates and updates comment positions when document content changes.
 * Handles cases where commented text is deleted:
 * - Snaps to nearest word if available
 * - Marks for deletion if no words remain nearby
 */

import { findAnchorPosition } from './text-anchor.js';

// Maximum distance to search for nearby words (in characters)
const MAX_SEARCH_DISTANCE = 100;

/**
 * Check if a position represents a collapsed selection (zero-length)
 * @param {{from: number, to: number}|null|undefined} position - Position to check
 * @returns {boolean} True if selection is collapsed or invalid
 */
export function isCollapsedSelection(position) {
  if (!position) {
    return true;
  }
  return position.from === position.to;
}

/**
 * Find the nearest word to a given position in the document
 * @param {string} doc - Document text
 * @param {number} position - Position to search from
 * @param {number} maxDistance - Maximum distance to search (default: MAX_SEARCH_DISTANCE)
 * @returns {{from: number, to: number}|null} Position of nearest word or null if none found
 */
export function findNearestWord(doc, position, maxDistance = MAX_SEARCH_DISTANCE) {
  if (!doc || doc.length === 0) {
    return null;
  }

  // Clamp position to document bounds
  const safePos = Math.max(0, Math.min(position, doc.length));

  // Search both directions for word boundaries
  const searchStart = Math.max(0, safePos - maxDistance);
  const searchEnd = Math.min(doc.length, safePos + maxDistance);
  const searchArea = doc.substring(searchStart, searchEnd);

  // Word pattern: one or more alphanumeric characters (not just underscores)
  // We want actual words, not markdown syntax like underscores
  const wordRegex = /[a-zA-Z0-9]+/g;
  const words = [];
  let match;

  while ((match = wordRegex.exec(searchArea)) !== null) {
    const wordStart = searchStart + match.index;
    const wordEnd = wordStart + match[0].length;
    const distanceToWord = Math.min(Math.abs(safePos - wordStart), Math.abs(safePos - wordEnd));

    words.push({
      from: wordStart,
      to: wordEnd,
      distance: distanceToWord,
    });
  }

  if (words.length === 0) {
    return null;
  }

  // Sort by distance and return the closest word
  words.sort((a, b) => a.distance - b.distance);
  const nearest = words[0];

  return {
    from: nearest.from,
    to: nearest.to,
  };
}

/**
 * Determine if a comment should be deleted based on lack of nearby words
 * @param {string} doc - Document text
 * @param {number} position - Position where comment was located
 * @param {number} maxDistance - Maximum distance to search for words
 * @returns {boolean} True if comment should be deleted
 */
export function shouldDeleteComment(doc, position, maxDistance = MAX_SEARCH_DISTANCE) {
  const nearestWord = findNearestWord(doc, position, maxDistance);
  return nearestWord === null;
}

/**
 * Validate and update a comment's position in the document
 * @param {string} doc - Current document text
 * @param {Object} comment - Comment object with anchor and fallbackPosition
 * @returns {{action: 'keep'|'snap'|'delete', position: {from: number, to: number}|null}}
 *          Action to take and updated position (if applicable)
 */
export function validateCommentPosition(doc, comment) {
  console.log('[Validator] Validating comment:', comment.id);
  console.log('[Validator] Anchor:', comment.anchor);

  // Try to find the anchor in the current document
  const anchorPosition = findAnchorPosition(doc, comment.anchor);
  console.log('[Validator] Anchor position found:', anchorPosition);

  // If anchor is found and valid (non-collapsed), keep it
  if (anchorPosition && !isCollapsedSelection(anchorPosition)) {
    console.log('[Validator] Anchor is valid, keeping position');
    return {
      action: 'keep',
      position: anchorPosition,
    };
  }

  // Anchor not found or collapsed - use fallback position as reference
  let referencePos;
  if (anchorPosition) {
    referencePos = anchorPosition.from;
  } else if (comment.fallbackPosition) {
    // Handle both old format {from: {line, col}} and new format {from: number}
    referencePos =
      typeof comment.fallbackPosition.from === 'number'
        ? comment.fallbackPosition.from
        : comment.fallbackPosition.from.col;
  } else {
    // No position information, can't validate
    return { action: 'delete', position: null };
  }
  console.log(
    '[Validator] Using reference position:',
    referencePos,
    'from',
    anchorPosition ? 'anchor' : 'fallback'
  );

  // Try to find a nearby word to snap to
  const nearestWord = findNearestWord(doc, referencePos);
  console.log('[Validator] Nearest word found:', nearestWord);

  if (nearestWord) {
    console.log('[Validator] Snapping to word at position', nearestWord.from, '-', nearestWord.to);
    return {
      action: 'snap',
      position: nearestWord,
    };
  }

  // No words nearby - comment should be deleted
  console.log('[Validator] No nearby words, deleting comment');
  return {
    action: 'delete',
    position: null,
  };
}

/**
 * Validate all comments for a document and return update instructions
 * @param {string} doc - Current document text
 * @param {Array} comments - Array of comment objects
 * @returns {Array<{commentId: string, action: 'keep'|'snap'|'delete', position: Object|null}>}
 */
export function validateAllComments(doc, comments) {
  return comments.map((comment) => {
    const result = validateCommentPosition(doc, comment);
    return {
      commentId: comment.id,
      ...result,
    };
  });
}
