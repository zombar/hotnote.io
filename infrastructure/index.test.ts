import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

// Set up Pulumi mocking
pulumi.runtime.setMocks({
  newResource: function (args: pulumi.runtime.MockResourceArgs): {
    id: string;
    state: any;
  } {
    const outputs = args.inputs;

    // Add default outputs for specific resource types
    if (args.type === 'digitalocean:index/app:App') {
      return {
        id: args.name + '_id',
        state: {
          ...args.inputs,
          id: '0103986a-6ef9-4886-b030-c4abca6e01f7',
          liveUrl: 'https://hotnote-test.ondigitalocean.app',
          defaultIngress: 'https://hotnote-xxxxx.ondigitalocean.app',
          activeDeploymentId: 'deployment-123',
        },
      };
    }

    if (args.type === 'digitalocean:index/domain:Domain') {
      return {
        id: args.name + '_id',
        state: {
          ...args.inputs,
          id: 'hotnote.io',
          urn: 'urn:pulumi:test::test::digitalocean:index/domain:Domain::hotnote-domain',
        },
      };
    }

    if (args.type === 'digitalocean:index/dnsRecord:DnsRecord') {
      return {
        id: args.name + '_id',
        state: {
          ...args.inputs,
          id: 'dns-record-123',
          fqdn: 'hotnote.io',
        },
      };
    }

    return {
      id: args.name + '_id',
      state: outputs,
    };
  },
  call: function (args: pulumi.runtime.MockCallArgs) {
    return args.inputs;
  },
});

describe('Pulumi Infrastructure Tests', () => {
  let infrastructure: typeof import('./index');

  beforeEach(async () => {
    // Set environment variables for testing
    process.env.IMAGE_TAG = 'test-tag';

    // Dynamically import the infrastructure to get fresh state
    infrastructure = await import('./index');
  });

  afterEach(() => {
    // Clean up
    delete process.env.IMAGE_TAG;
  });

  describe('App Configuration', () => {
    it('should export appUrl', async () => {
      const appUrl = await promiseOf(infrastructure.appUrl);
      expect(appUrl).toBeDefined();
      expect(appUrl).toContain('digitalocean.app');
    });

    it('should export appId', async () => {
      const appId = await promiseOf(infrastructure.appId);
      expect(appId).toBeDefined();
    });

    it('should export domain name', async () => {
      const domainName = await promiseOf(infrastructure.domainName);
      expect(domainName).toBe('hotnote.io');
    });

    it('should export nameservers', async () => {
      const nameservers = await promiseOf(infrastructure.nameservers);
      expect(nameservers).toEqual([
        'ns1.digitalocean.com',
        'ns2.digitalocean.com',
        'ns3.digitalocean.com',
      ]);
    });
  });

  describe('Image Configuration', () => {
    it('should use correct registry', async () => {
      // This test validates that the infrastructure uses the correct registry name
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app).toBeDefined();
      expect(app?.state.spec.services[0].image.registryType).toBe('DOCR');
      expect(app?.state.spec.services[0].image.registry).toBe('hotnote');
      expect(app?.state.spec.services[0].image.repository).toBe('hotnote');
    });

    it('should use IMAGE_TAG environment variable when provided', async () => {
      process.env.IMAGE_TAG = '1.2.3';

      // Re-import to pick up new env var
      const freshInfra = await import('./index?update=' + Date.now());
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app?.state.spec.services[0].image.tag).toBe('1.2.3');
    });

    it('should default to "latest" tag when IMAGE_TAG is not provided', async () => {
      delete process.env.IMAGE_TAG;

      // Re-import to pick up cleared env var
      const freshInfra = await import('./index?update=' + Date.now());
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app?.state.spec.services[0].image.tag).toBe('latest');
    });
  });

  describe('App Platform Configuration', () => {
    it('should configure app in Frankfurt region', async () => {
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app?.state.spec.region).toBe('fra1');
    });

    it('should use basic-xxs instance size', async () => {
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app?.state.spec.services[0].instanceSizeSlug).toBe('basic-xxs');
    });

    it('should configure httpPort to 80', async () => {
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app?.state.spec.services[0].httpPort).toBe(80);
    });

    it('should configure health check on root path', async () => {
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app?.state.spec.services[0].healthCheck.httpPath).toBe('/');
    });

    it('should set instance count to 1', async () => {
      const resources = await getResources();
      const app = resources.find(r => r.type === 'digitalocean:index/app:App');

      expect(app?.state.spec.services[0].instanceCount).toBe(1);
    });
  });
});

// Helper function to convert Pulumi Output to Promise
function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => {
    output.apply((value) => {
      resolve(value);
      return value;
    });
  });
}

// Helper to get all created resources
async function getResources(): Promise<Array<{ type: string; name: string; state: any }>> {
  const resources: Array<{ type: string; name: string; state: any }> = [];

  // Access the mocked resources (this is a simplified version)
  // In a real test, you'd track resources created during the import
  return resources;
}
