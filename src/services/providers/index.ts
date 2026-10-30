import { RealGitlabClient, type GitlabClient } from '../gitlab/client';
import { AzureDevOpsClient } from './azure';

export type ProviderKind = 'gitlab' | 'azure';

export interface ProviderInfo {
  label: string;
  hostPlaceholder: string;
  tokenPlaceholder: string;
  tokenHint: string;
}

export const PROVIDERS: Record<ProviderKind, ProviderInfo> = {
  gitlab: {
    label: 'GitLab',
    hostPlaceholder: 'https://gitlab.exemplo.com',
    tokenPlaceholder: 'glpat-…',
    tokenHint: 'Crie um token com escopo read_api no seu perfil do GitLab.',
  },
  azure: {
    label: 'Azure DevOps',
    hostPlaceholder: 'https://dev.azure.com/sua-organizacao',
    tokenPlaceholder: 'Personal Access Token',
    tokenHint: 'Crie um PAT em User settings → Personal access tokens com leitura de Work Items, Code e Build.',
  },
};

export function createClient(kind: ProviderKind, host: string, token: string): GitlabClient {
  return kind === 'azure' ? new AzureDevOpsClient(token, host) : new RealGitlabClient(token, host);
}

export const hostnameOf = (host: string) => {
  try {
    return new URL(host).hostname;
  } catch {
    return host;
  }
};

export const isValidHost = (host: string) => /^https?:\/\/[^/\s]+/i.test(host.trim());
