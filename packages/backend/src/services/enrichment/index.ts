import { CONFIG } from '../../config.js';
import type { EnrichmentProvider } from './types.js';
import { ApolloProvider } from './providers/apollo.js';
import { ProspeoProvider } from './providers/prospeo.js';

export function getEnrichmentService(): EnrichmentProvider {
  const providerType = CONFIG.activeEnrichmentProvider?.toLowerCase();
  
  if (providerType === 'apollo') {
    return new ApolloProvider();
  } else if (providerType === 'prospeo') {
    return new ProspeoProvider();
  }

  // Default to prospeo if none or unrecognized
  return new ProspeoProvider();
}
