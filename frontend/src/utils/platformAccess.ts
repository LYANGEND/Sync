const LOCAL_PLATFORM_HOSTS = new Set(['localhost', '127.0.0.1']);

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
  if (LOCAL_PLATFORM_HOSTS.has(host)) return true;

  const configuredHosts = readConfiguredHosts().map(normalizeHost);
  if (!configuredHosts.length) {
    return host.startsWith('ops.');
  }

  return configuredHosts.includes(host);
};

export const shouldExposePlatformRoutes = () => isPlatformHost();