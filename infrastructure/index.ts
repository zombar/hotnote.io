import * as pulumi from '@pulumi/pulumi';
import * as digitalocean from '@pulumi/digitalocean';

// Get the image tag from environment or use latest
const imageTag = process.env.IMAGE_TAG || 'latest';
const imageRepo = process.env.GITHUB_REPOSITORY || 'jamartin/hotnote';
const imageName = `ghcr.io/${imageRepo.toLowerCase()}:${imageTag}`;

// Create a DigitalOcean App Platform app
const app = new digitalocean.App('hotnote-app', {
  spec: {
    name: 'hotnote',
    region: 'fra', // Frankfurt
    services: [
      {
        name: 'web',
        instanceCount: 1,
        instanceSizeSlug: 'professional-xs', // Smallest high CPU AMD instance
        image: {
          registryType: 'GHCR',
          registry: imageRepo.toLowerCase(),
          repository: imageRepo.toLowerCase(),
          tag: imageTag,
        },
        httpPort: 80,
        routes: [
          {
            path: '/',
          },
        ],
        healthCheck: {
          httpPath: '/',
          initialDelaySeconds: 10,
          periodSeconds: 10,
          timeoutSeconds: 3,
          successThreshold: 1,
          failureThreshold: 3,
        },
      },
    ],
  },
});

// Export the app's live URL
export const appUrl = app.liveUrl;
export const appId = app.id;
export const deployedImage = imageName;
