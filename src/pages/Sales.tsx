import { Period } from '../types';

interface SalesProps { period: Period }

export function Sales({ period: _period }: SalesProps) {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <span className="text-3xl">📊</span>
      </div>
      <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Integração Paytour desativada</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        Os dados de vendas estão indisponíveis. A integração com o Paytour foi removida desta instalação.
      </p>
    </div>
  );
}
