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

// Export the app's live URL and domain info
export const appUrl = app.liveUrl;
export const appId = app.id;
export const domainName = domain.name;
export const nameservers = domain.urn.apply(() => [
  'ns1.digitalocean.com',
  'ns2.digitalocean.com',
  'ns3.digitalocean.com',
]);
