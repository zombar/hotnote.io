/**
 * Environment Detection Utilities
 * Detect whether the app is running locally or hosted
 */

/**
 * Check if the app is running on localhost
 * @returns {boolean} - true if running locally, false if hosted
 */
export function isLocalEnvironment() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;

  // Check for localhost variations
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' || // IPv6 localhost
    hostname.startsWith('192.168.') || // Local network
    hostname.startsWith('10.') || // Local network
    hostname.endsWith('.local') // mDNS local domain
  );
}

/**
 * Check if the app is running on the production hosted site
 * @returns {boolean} - true if hosted on hotnote.io
 */
export function isHostedEnvironment() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = window.location.hostname;
  return hostname === 'hotnote.io' || hostname.endsWith('.hotnote.io');
}

/**
 * Get the current environment type
 * @returns {'local'|'hosted'|'unknown'}
 */
export function getEnvironmentType() {
  if (isLocalEnvironment()) {
    return 'local';
  }
  if (isHostedEnvironment()) {
    return 'hosted';
  }
  return 'unknown';
}
