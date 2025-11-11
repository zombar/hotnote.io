/**
 * URLParamManager
 *
 * Manages URL parameters for workspace and file navigation
 * Provides deep linking and bookmark support
 *
 * URL Schema:
 * - ?workdir=/path/to/folder              (workspace only)
 * - ?workdir=/path/to/folder&file=doc.md  (workspace + file)
 *
 * Validation Rules:
 * - file param REQUIRES workdir param
 * - file without workdir = INVALID (both params cleared)
 * - Empty values treated as no value
 */

/* global URLSearchParams */

export class URLParamManager {
  /**
   * Encode URI component but preserve forward slashes
   * @private
   */
  static encodePreservingSlashes(str) {
    return encodeURIComponent(str).replace(/%2F/g, '/');
  }
  /**
   * Validate current URL parameters
   * Returns null for both if file exists without workdir (invalid state)
   *
   * @returns {{ workdir: string|null, file: string|null }}
   */
  static validate() {
    const params = new URLSearchParams(window.location.search);

    let workdir = params.get('workdir');
    let file = params.get('file');

    // Treat empty strings as null
    if (workdir === '') workdir = null;
    if (file === '') file = null;

    // Validation Rule: file requires workdir
    // If file exists without workdir, return null for both (invalid state)
    if (file && !workdir) {
      return { workdir: null, file: null };
    }

    return { workdir, file };
  }

  /**
   * Get workdir parameter value
   * Returns null if empty or doesn't exist
   *
   * @returns {string|null}
   */
  static getWorkdir() {
    const { workdir } = this.validate();
    return workdir;
  }

  /**
   * Get file parameter value
   * Returns null if empty, doesn't exist, or invalid state (no workdir)
   *
   * @returns {string|null}
   */
  static getFile() {
    const { file } = this.validate();
    return file;
  }

  /**
   * Check if current URL state is invalid
   * Returns true if file param exists without workdir param
   *
   * @returns {boolean}
   */
  static isInvalidState() {
    const params = new URLSearchParams(window.location.search);
    const hasFile = params.has('file') && params.get('file') !== '';
    const hasWorkdir = params.has('workdir') && params.get('workdir') !== '';

    // Invalid if file exists but workdir doesn't
    return hasFile && !hasWorkdir;
  }

  /**
   * Update URL parameters using history.replaceState
   * Does not create new history entry (no pushState)
   *
   * Rules:
   * - If both null: clear params
   * - If workdir null but file provided: clear params (invalid combo)
   * - If workdir provided, file null: set workdir only
   * - If both provided: set both
   *
   * @param {string|null} workdir - Workspace directory path
   * @param {string|null} file - File path relative to workdir
   */
  static update(workdir, file) {
    // Treat empty strings as null
    if (workdir === '') workdir = null;
    if (file === '') file = null;

    // If file provided but no workdir, treat as invalid - clear all
    if (file && !workdir) {
      this.clear();
      return;
    }

    // If no workdir, clear all params
    if (!workdir) {
      this.clear();
      return;
    }

    // Build new URL with params, preserving other query params
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);

    // Remove our params
    params.delete('workdir');
    params.delete('file');

    // Build query string manually to preserve forward slashes
    const paramPairs = [];

    // Add our params first with custom encoding
    paramPairs.push(`workdir=${this.encodePreservingSlashes(workdir)}`);
    if (file) {
      paramPairs.push(`file=${this.encodePreservingSlashes(file)}`);
    }

    // Add other existing params (use standard encoding from URLSearchParams)
    for (const [key, value] of params.entries()) {
      paramPairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }

    const queryString = paramPairs.length > 0 ? '?' + paramPairs.join('&') : '';
    window.history.replaceState(null, '', url.pathname + queryString);
  }

  /**
   * Clear URL parameters (workdir and file)
   * Preserves other unrelated query parameters
   */
  static clear() {
    const url = new URL(window.location.href);
    url.searchParams.delete('workdir');
    url.searchParams.delete('file');

    window.history.replaceState(null, '', url.pathname + url.search);
  }
}
