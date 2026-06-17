import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'paytour_mock_mode';
const EVENT_NAME  = 'paytour-mock-mode-change';

function readStored(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

// ── Liga/desliga dados simulados só do Paytour (fallback quando a API cair) ────
export function usePaytourMockMode(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(readStored);

  useEffect(() => {
    const onChange = () => setEnabled(readStored());
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const set = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return [enabled, set];
}
