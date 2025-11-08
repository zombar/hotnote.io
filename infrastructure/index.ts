import * as pulumi from '@pulumi/pulumi';
import * as digitalocean from '@pulumi/digitalocean';

// Get configuration
const config = new pulumi.Config();
const imageTag = process.env.IMAGE_TAG || 'latest';

// Use existing DigitalOcean Container Registry (registry.digitalocean.com/hotnote)
const registry = 'hotnote';
const repository = 'hotnote';

// Create a DigitalOcean App Platform app
const app = new digitalocean.App('hotnote-app', {
  spec: {
    name: 'hotnote',
    region: 'fra', // Frankfurt
    domains: ['hotnote.io'],
    services: [
      {
        name: 'hotnote-web',
        instanceCount: 1,
        instanceSizeSlug: 'basic-xxs',
        image: {
          registryType: 'DOCR',
          registry: registry,
          repository: repository,
          tag: imageTag,
        },
        httpPort: 80,
        healthCheck: {
          httpPath: '/',
        },
      },
    ],
  },
});

// Create DigitalOcean DNS domain
const domain = new digitalocean.Domain('hotnote-domain', {
  name: 'hotnote.io',
});

// Create CNAME record pointing to the app's default URL
// The app.defaultIngress returns the full URL (https://hotnote-xxxxx.ondigitalocean.app)
// We need to extract just the hostname
const appDefaultHostname = app.defaultIngress.apply((url) => {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
});

const cnameRecord = new digitalocean.DnsRecord('hotnote-cname', {
  domain: domain.name,
  type: 'CNAME',
  name: '@', // @ represents the root domain
  value: appDefaultHostname.apply((hostname) => `${hostname}.`), // CNAME values must end with a dot
  ttl: 3600,
});

// Export the app's live URL and domain info
export const appUrl = app.liveUrl;
export const appId = app.id;
export const appDefaultUrl = app.defaultIngress;
export const domainName = domain.name;
export const nameservers = domain.urn.apply(() => [
  'ns1.digitalocean.com',
  'ns2.digitalocean.com',
  'ns3.digitalocean.com',
]);
