/**
 * GitHubAdapter - Provides read-only access to GitHub repository files
 * via the GitHub API and raw content URLs.
 */
export class GitHubAdapter {
  constructor(owner, repo, branch = 'main') {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * Parse a GitHub URL and extract repository information
   * @param {string} url - GitHub URL (raw.githubusercontent.com or github.com/blob)
   * @returns {{owner: string, repo: string, branch: string, path: string}}
   * @throws {Error} If URL format is invalid
   */
  static parseURL(url) {
    // Pattern for raw.githubusercontent.com URLs
    const rawPattern =
      /^https:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)$/;

    // Pattern for github.com blob URLs
    const blobPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/;

    const rawMatch = url.match(rawPattern);
    if (rawMatch) {
      return {
        owner: rawMatch[1],
        repo: rawMatch[2],
        branch: rawMatch[3],
        path: rawMatch[4],
      };
    }

    const blobMatch = url.match(blobPattern);
    if (blobMatch) {
      return {
        owner: blobMatch[1],
        repo: blobMatch[2],
        branch: blobMatch[3],
        path: blobMatch[4],
      };
    }

    throw new Error('Invalid GitHub URL format');
  }

  /**
   * Read file content from GitHub
   * @param {string} path - File path within the repository
   * @returns {Promise<string>} File content
   * @throws {Error} If file cannot be read
   */
  async readFile(path) {
    const url = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  /**
   * List directory contents using GitHub API
   * @param {string} path - Directory path (empty string for root)
   * @returns {Promise<Array<{name: string, type: 'file'|'dir', size: number, path: string, downloadUrl: string}>>}
   * @throws {Error} If directory cannot be listed
   */
  async listDirectory(path) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const items = await response.json();

    return items.map((item) => ({
      name: item.name,
      type: item.type, // 'file' or 'dir'
      size: item.size,
      path: item.path,
      downloadUrl: item.download_url,
    }));
  }

  /**
   * Get file metadata from GitHub API
   * @param {string} path - File path within the repository
   * @returns {Promise<{size: number, sha: string}>} File metadata
   * @throws {Error} If metadata cannot be retrieved
   */
  async getMetadata(path) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      size: data.size,
      sha: data.sha,
    };
  }
}
