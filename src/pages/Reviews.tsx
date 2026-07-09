import { MessageSquare, AlertCircle, Settings, ExternalLink, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useState } from 'react';
import { useGoogleBusiness } from '../hooks/useGoogleBusiness';
import { Period } from '../types';

interface ReviewsProps { period: Period }

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  );
}

const AVATAR_COLORS = ['bg-blue-500','bg-green-500','bg-purple-500','bg-red-500','bg-orange-500','bg-pink-500'];
function Avatar({ name }: { name: string }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Skeleton({ h = 'h-8', full = false }: { h?: string; full?: boolean }) {
  return <div className={`${full ? 'w-full' : ''} ${h} bg-gray-100 dark:bg-gray-700 rounded animate-pulse`} />;
}

const GOOGLE_BUSINESS_URL = 'https://business.google.com/reviews';

export function Reviews({ period }: ReviewsProps) {
  const { data, loading, error, notConfigured } = useGoogleBusiness(period);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  const maxCount = data ? Math.max(...data.ratingDistribution.map((r) => r.count), 1) : 1;
  const maxKw    = data ? (data.topKeywords[0]?.count ?? 1) : 1;

  function toggleReply(id: string) {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!loading && notConfigured) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Avaliações Google</h2>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-6 flex gap-4 items-start">
          <Settings size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Configuração pendente</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
              Adicione as variáveis abaixo ao arquivo <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env.local</code> e reinicie o servidor:
            </p>
            <pre className="text-xs bg-amber-100 dark:bg-amber-900/40 rounded-lg p-3 text-amber-900 dark:text-amber-200 select-all">
{`GOOGLE_PLACES_API_KEY=sua_chave_aqui
GOOGLE_PLACE_ID=ChIJ...`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Avaliações Google</h2>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-5 flex gap-3 items-start">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">Erro ao carregar avaliações</p>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Tendência: últimas reviews vs média geral
  const trend = data?.last5Avg != null && data?.averageRating
    ? data.last5Avg - data.averageRating
    : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Avaliações Google</h2>
        <a
          href={GOOGLE_BUSINESS_URL}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          <ExternalLink size={12} />
          Abrir Google Business
        </a>
      </div>

      {/* Nota média + tendência */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center gap-1">
          {loading ? (
            <div className="space-y-2 w-32">
              <Skeleton h="h-16" full />
              <Skeleton h="h-6" full />
              <Skeleton h="h-4" full />
            </div>
          ) : (
            <>
              <div className="text-6xl font-bold text-gray-900 dark:text-white">
                {data?.averageRating?.toFixed(1)}
              </div>
              <div className="text-3xl text-yellow-400 mt-1">
                {'★'.repeat(Math.round(data?.averageRating ?? 0))}
                {'☆'.repeat(5 - Math.round(data?.averageRating ?? 0))}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {data?.totalReviews.toLocaleString('pt-BR')} avaliações
              </p>

              {trend !== null && (
                <div className={`mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${
                  trend > 0.1 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' :
                  trend < -0.1 ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
                  'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {trend > 0.1 ? <TrendingUp size={12} /> : trend < -0.1 ? <TrendingDown size={12} /> : <Minus size={12} />}
                  Últimas: {data?.last5Avg?.toFixed(1)}★
                  {trend > 0.1 ? ' (subindo)' : trend < -0.1 ? ' (caindo)' : ' (estável)'}
                </div>
              )}

              {(data?.unansweredCount ?? 0) > 0 && (
                <div className="mt-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs px-3 py-1.5 rounded-full font-medium">
                  {data?.unansweredCount} aguardando resposta
                </div>
              )}
            </>
          )}
        </div>

        {/* Distribuição por estrelas */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Distribuição por Estrelas</h3>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} full />)}</div>
          ) : (
            <>
              <div className="space-y-2">
                {[...(data?.ratingDistribution ?? [])].map((r) => (
                  <div key={r.stars} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400 w-4 text-right">{r.stars}</span>
                    <span className="text-yellow-400 text-xs">★</span>
                    <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full transition-all duration-700"
                        style={{ width: `${maxCount > 0 ? (r.count / maxCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                      {r.count.toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                * Estimado com base nas avaliações recentes disponíveis via API
              </p>
            </>
          )}
        </div>
      </div>

      {/* Avaliações recentes com respostas expansíveis */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Avaliações Recentes</h3>
          {!loading && (data?.unansweredCount ?? 0) > 0 && (
            <a
              href={GOOGLE_BUSINESS_URL}
              target="_blank" rel="noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <MessageSquare size={11} />
              Responder no Google
            </a>
          )}
        </div>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="h-24" full />)}</div>
        ) : !data?.recentReviews.length ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma avaliação disponível</p>
        ) : (
          <div className="space-y-3">
            {data.recentReviews.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50">
                  <Avatar name={r.author} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.author}</span>
                      <span className="text-xs text-gray-400">{r.date}</span>
                    </div>
                    <Stars rating={r.rating} />
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{r.text}</p>
                    <div className="mt-1.5">
                      {r.replied ? (
                        <button
                          onClick={() => toggleReply(r.id)}
                          className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium hover:underline"
                        >
                          ✓ Respondida
                          {expandedReplies.has(r.id) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                      ) : (
                        <a
                          href={GOOGLE_BUSINESS_URL}
                          target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                        >
                          <MessageSquare size={11} /> Responder
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Resposta expansível */}
                {r.replied && r.replyText && expandedReplies.has(r.id) && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-900/10">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">
                      💬 Resposta do estabelecimento
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{r.replyText}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Palavras mais mencionadas com sentimento por cor */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Palavras Mais Mencionadas</h3>
        <p className="text-xs text-gray-400 mb-4">Verde = mencionadas em avaliações positivas · Vermelho = negativas</p>
        {loading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-7 w-20 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />)}
          </div>
        ) : !data?.topKeywords.length ? (
          <p className="text-sm text-gray-400">Sem dados suficientes para análise de palavras-chave</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.topKeywords.map((kw) => {
              const size = 12 + Math.round((kw.count / maxKw) * 8);
              const cls = kw.sentiment === 'neg'
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                : kw.sentiment === 'pos'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300';
              return (
                <span
                  key={kw.word}
                  className={`px-3 py-1 rounded-full font-medium ${cls}`}
                  style={{ fontSize: `${size}px` }}
                >
                  {kw.word}{' '}
                  <span className="opacity-60 text-xs">({kw.count})</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
