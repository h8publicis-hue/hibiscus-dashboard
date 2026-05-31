export function useMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true';
}
