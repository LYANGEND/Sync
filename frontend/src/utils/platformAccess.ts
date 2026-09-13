const readConfiguredHosts = () => {
  const raw = (import.meta.env.VITE_PLATFORM_HOSTS || '') as string;
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

export const getCurrentHost = () => normalizeHost(window.location.hostname || '');

export const isPlatformHost = () => {
  const host = getCurrentHost();
  if (!host) return false;

  const configuredHosts = readConfiguredHosts().map(normalizeHost);
  if (configuredHosts.length) {
    return configuredHosts.includes(host);
  }

  return host.startsWith('ops.');
};

export const shouldExposePlatformRoutes = () => isPlatformHost();