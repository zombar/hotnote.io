/**
 * Position Converter
 *
 * Converts cursor positions between raw markdown and rendered text.
 * Raw markdown includes syntax characters (#, **, _, etc.) while rendered text shows only content.
 */

/**
 * Converts a position in raw markdown to the equivalent position in rendered text
 * @param {string} markdown - The raw markdown content
 * @param {number} offset - Character offset in raw markdown
 * @returns {number} Equivalent offset in rendered text
 */
export function markdownOffsetToRendered(markdown, offset) {
  if (offset <= 0) return 0;
  if (offset >= markdown.length) {
    return getRenderedLength(markdown);
  }

  const map = buildPositionMap(markdown);
  return map.rawToRendered[offset] ?? map.rawToRendered[map.rawToRendered.length - 1];
}

/**
 * Converts a position in rendered text to the equivalent position in raw markdown
 * @param {string} markdown - The raw markdown content
 * @param {number} offset - Character offset in rendered text
 * @returns {number} Equivalent offset in raw markdown
 */
export function renderedOffsetToMarkdown(markdown, offset) {
  if (offset <= 0) return 0;

  const map = buildPositionMap(markdown);
  return map.renderedToRaw[offset] ?? map.renderedToRaw[map.renderedToRaw.length - 1];
}

/**
 * Gets the length of text as it would appear when rendered
 * @param {string} markdown - The raw markdown content
 * @returns {number} Length of rendered text
 */
function getRenderedLength(markdown) {
  const map = buildPositionMap(markdown);
  return map.rawToRendered[markdown.length] ?? 0;
}

/**
 * Builds bidirectional position mapping between raw markdown and rendered text
 * @param {string} markdown - The raw markdown content
 * @returns {{rawToRendered: number[], renderedToRaw: number[]}}
 */
function buildPositionMap(markdown) {
  const rawToRendered = [];
  const renderedToRaw = [];

  let renderedPos = 0;
  let i = 0;

  while (i < markdown.length) {
    const char = markdown[i];
    const nextChar = markdown[i + 1];

    let skip = 0; // Number of characters to skip (markdown syntax)
    let isContent = true; // Whether this character is content (vs syntax)

    // Check for markdown syntax patterns
    // Note: This is a simplified parser that handles common cases
    // Order matters: check more specific patterns first

    // Heading at start of line (# , ## , ### , etc.)
    if ((i === 0 || markdown[i - 1] === '\n') && char === '#') {
      let hashCount = 0;
      let j = i;
      while (j < markdown.length && markdown[j] === '#') {
        hashCount++;
        j++;
      }
      // Skip the hashes and following space if present
      if (j < markdown.length && markdown[j] === ' ') {
        skip = hashCount + 1;
      } else {
        skip = hashCount;
      }
      isContent = false;
    }

    // List markers at start of line (- , * , + , or numbered)
    // Check this BEFORE italic to avoid confusion with * at start of line
    else if (i === 0 || markdown[i - 1] === '\n') {
      if ((char === '-' || char === '*' || char === '+') && nextChar === ' ') {
        skip = 2; // Skip marker and space
        isContent = false;
      } else if (/\d/.test(char)) {
        // Numbered list (1. , 2. , etc.)
        let j = i;
        while (j < markdown.length && /\d/.test(markdown[j])) {
          j++;
        }
        if (j < markdown.length && markdown[j] === '.' && markdown[j + 1] === ' ') {
          skip = j - i + 2; // Skip number, dot, and space
          isContent = false;
        }
      } else if (char === '>' && nextChar === ' ') {
        // Blockquote (> )
        skip = 2; // Skip > and space
        isContent = false;
      }
    }

    // Bold (**text**)
    else if (char === '*' && nextChar === '*') {
      skip = 2;
      isContent = false;
    }

    // Italic (*text* or _text_)
    else if ((char === '*' && nextChar !== '*') || char === '_') {
      skip = 1;
      isContent = false;
    }

    // Inline code (`code`)
    else if (char === '`') {
      skip = 1;
      isContent = false;
    }

    // Link start ([text)
    else if (char === '[') {
      skip = 1;
      isContent = false;
    }

    // Link middle (](url))
    else if (char === ']' && nextChar === '(') {
      // Skip ]( and everything until closing )
      let j = i + 2;
      while (j < markdown.length && markdown[j] !== ')') {
        j++;
      }
      if (j < markdown.length) {
        skip = j - i + 1; // Skip ](url)
      } else {
        skip = 1; // Just skip the ]
      }
      isContent = false;
    }

    // Image (![alt](url))
    else if (char === '!' && nextChar === '[') {
      // Skip entire image syntax
      let j = i + 2;
      // Skip to ]
      while (j < markdown.length && markdown[j] !== ']') {
        j++;
      }
      if (j < markdown.length && markdown[j + 1] === '(') {
        // Skip (url)
        j += 2;
        while (j < markdown.length && markdown[j] !== ')') {
          j++;
        }
        if (j < markdown.length) {
          skip = j - i + 1;
        }
      }
      isContent = false;
    }

    // Process the character(s)
    if (skip > 0) {
      // Map all skipped positions to the current rendered position
      // (they will point to the next content character)
      for (let j = 0; j < skip; j++) {
        rawToRendered[i + j] = renderedPos;
      }
      i += skip;
      // Note: We don't set renderedToRaw here - that's only for content
    } else if (isContent) {
      // This is content - maps to rendered text
      rawToRendered[i] = renderedPos;
      renderedToRaw[renderedPos] = i;
      renderedPos++;
      i++;
    } else {
      // Shouldn't reach here, but handle it
      rawToRendered[i] = renderedPos;
      i++;
    }
  }

  // Handle end position
  rawToRendered[markdown.length] = renderedPos;
  renderedToRaw[renderedPos] = markdown.length;

  return { rawToRendered, renderedToRaw };
}
