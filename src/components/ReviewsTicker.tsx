import { useState, useEffect, useMemo } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { GoogleBusinessData, SurveyMonkeyData } from '../types';

interface TickerItem {
  id:     string;
  source: 'google' | 'survey';
  author: string;
  text:   string;
  score:  number;     // 1–5 para Google, 1–10 para Survey
  date:   string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

interface ReviewsTickerProps {
  googleData?: GoogleBusinessData | null;
  surveyData?: SurveyMonkeyData  | null;
  intervalMs?: number;
}

const INTERVAL   = 6000;
const MAX_TEXT   = 160;
const MAX_DAYS   = 0;   // janela principal: hoje
const MIN_ITEMS  = 3;   // se tiver menos, expande para 7 dias

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={12}
          className={s <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-500'}
        />
      ))}
    </span>
  );
}

export function ReviewsTicker({ googleData, surveyData, intervalMs = INTERVAL }: ReviewsTickerProps) {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);

  // Monta lista unificada de avaliações — apenas recentes
  const items: TickerItem[] = useMemo(() => {
    function buildList(days: number): TickerItem[] {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const list: TickerItem[] = [];

      (googleData?.recentReviews ?? []).forEach((r) => {
        if (!r.text?.trim()) return;
        if (r.date && new Date(r.date) < cutoff) return;
        list.push({ id: `g-${r.id}`, source: 'google', author: r.author, text: r.text, score: r.rating, date: r.date });
      });

      (surveyData?.recentResponses ?? []).forEach((r) => {
        if (!r.text?.trim()) return;
        if (r.date && new Date(r.date) < cutoff) return;
        list.push({ id: `s-${r.id}`, source: 'survey', author: 'Avaliação NPS', text: r.text, score: Math.round((r.score / 10) * 5), date: r.date, sentiment: r.sentiment });
      });

      return list;
    }

    // Tenta hoje; se poucos resultados expande para 7 dias, depois 30 dias
    const recent = buildList(MAX_DAYS);
    const final  = recent.length >= MIN_ITEMS ? recent : (buildList(7).length >= MIN_ITEMS ? buildList(7) : buildList(30));
    return final.sort(() => Math.random() - 0.5);
  }, [googleData, surveyData]);

  // Avança item com fade out → troca → fade in
  useEffect(() => {
    if (items.length === 0) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % items.length);
        setVisible(true);
      }, 400);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, intervalMs]);

  if (items.length === 0) return null;

  const item = items[idx % items.length];
  const text = item.text.length > MAX_TEXT
    ? item.text.slice(0, MAX_TEXT).trimEnd() + '…'
    : item.text;

  const sentimentColor = item.sentiment === 'positive' ? 'text-green-400'
    : item.sentiment === 'negative'  ? 'text-red-400'
    : 'text-gray-400';

  return (
    <div className="hidden lg:flex fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-t border-gray-700 h-[72px] items-center px-4 gap-4">

      {/* Esquerda: Autor + data */}
      <div
        className="flex-shrink-0 text-left w-36 transition-opacity duration-400"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <p className="text-xs font-medium text-gray-300 truncate">{item.author}</p>
        <p className="text-xs text-gray-500">
          {item.date
            ? new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : ''}
        </p>
      </div>

      <div className="w-px h-8 bg-gray-700 flex-shrink-0" />

      {/* Centro: badge + nota + texto */}
      <div
        className="flex-1 flex items-center gap-4 min-w-0 transition-opacity duration-400"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {/* Badge de fonte */}
        <div className="flex-shrink-0">
          {item.source === 'google' ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5">
              <Star size={10} className="fill-yellow-400" /> Google
            </span>
          ) : (
            <span className={clsx('inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2 py-0.5',
              item.sentiment === 'positive' ? 'bg-green-500/15 text-green-400 border-green-500/30'
              : item.sentiment === 'negative' ? 'bg-red-500/15 text-red-400 border-red-500/30'
              : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
            )}>
              <MessageSquare size={10} /> Survey
            </span>
          )}
        </div>

        {/* Nota */}
        <div className="flex-shrink-0">
          {item.source === 'google' ? (
            <Stars rating={item.score} />
          ) : (
            <span className={clsx('text-xs font-bold', sentimentColor)}>
              {Math.round((item.score / 5) * 10)}/10
            </span>
          )}
        </div>

        {/* Texto */}
        <p className="text-sm text-gray-200 truncate flex-1 min-w-0">
          "{text}"
        </p>
      </div>

      <div className="w-px h-8 bg-gray-700 flex-shrink-0" />

      {/* Direita: label + indicadores */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
          <MessageSquare size={13} className="text-brand-400" />
          Últimas avaliações
        </div>
        <div className="flex gap-1">
          {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
            <div
              key={i}
              className={clsx(
                'h-1 rounded-full transition-all duration-300',
                i === idx % Math.min(items.length, 8)
                  ? 'w-4 bg-brand-400'
                  : 'w-1 bg-gray-600',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
