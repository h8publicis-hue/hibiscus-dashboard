import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Tv } from 'lucide-react';

const KDS_ROUTES = ['/', '/vendas', '/satisfacao', '/avaliacoes', '/ocupacao'];

interface KdsProps {
  active: boolean;
  intervalMs: number;
}

export function KdsController({ active, intervalMs }: KdsProps) {
  const navigate = useNavigate();
  const idxRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % KDS_ROUTES.length;
      navigate(KDS_ROUTES[idxRef.current]);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, navigate]);

  return null;
}

export function KdsProgressBar({ active, intervalMs }: KdsProps) {
  const { pathname } = useLocation();
  if (!active) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 z-50">
      <div
        key={pathname}
        className="h-full bg-brand-600 kds-progress-bar"
        style={{ animationDuration: `${intervalMs}ms` }}
      />
    </div>
  );
}

export function KdsBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-brand-600/90 text-white text-xs px-3 py-1.5 rounded-full font-medium shadow-lg flex items-center gap-1.5">
      <Tv size={12} />
      Modo TV ativo
    </div>
  );
}
