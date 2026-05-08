const trimTrailingSlash = (value) => value.replace(/\/$/, '');

const resolveApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:5001`;
  }

  return 'http://localhost:5001';
};

export const API_URL = resolveApiUrl();
