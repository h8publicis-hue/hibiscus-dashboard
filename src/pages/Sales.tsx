import { Period } from '../types';

interface SalesProps { period: Period }

export function Sales({ period: _period }: SalesProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <div className="text-5xl">🚧</div>
      <h2 className="text-xl font-bold text-gray-700 dark:text-gray-200">Página em Desenvolvimento</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        Em breve, novidades por aqui. Estamos preparando algo especial para o módulo de vendas.
      </p>
    </div>
  );
}
