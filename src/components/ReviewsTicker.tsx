import { useState, useEffect, useMemo } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { GoogleBusinessData, SurveyMonkeyData } from '../types';

interface TickerItem {
  id:     string;
  source: 'google' | 'survey';
  author: string;
  text:   string;
  score:  number;
  date:   string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

interface ReviewsTickerProps {
  googleData?: GoogleBusinessData | null;
  surveyData?: SurveyMonkeyData  | null;
  intervalMs?: number;
}

const INTERVAL = 12000;
const MAX_TEXT = 160;
const MIN_ITEMS = 3;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={11} className={s <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'} />
      ))}
    </span>
  );
}

function buildList(days: number | null, googleData?: GoogleBusinessData | null, surveyData?: SurveyMonkeyData | null): TickerItem[] {
  const list: TickerItem[] = [];
  const cutoff = days !== null ? new Date(Date.now() - days * 86400000) : null;

  (googleData?.recentReviews ?? []).forEach((r) => {
    if (!r.text?.trim()) return;
    if (cutoff && r.date && new Date(r.date) < cutoff) return;
    list.push({ id: `g-${r.id}`, source: 'google', author: r.author, text: r.text, score: r.rating, date: r.date });
  });

  (surveyData?.recentResponses ?? []).forEach((r) => {
    if (!r.text?.trim()) return;
    if (cutoff && r.date && new Date(r.date) < cutoff) return;
    list.push({ id: `s-${r.id}`, source: 'survey', author: 'Avaliação NPS', text: r.text, score: Math.round((r.score / 10) * 5), date: r.date, sentiment: r.sentiment });
  });

  return list;
}

export function ReviewsTicker({ googleData, surveyData, intervalMs = INTERVAL }: ReviewsTickerProps) {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);

  const items: TickerItem[] = useMemo(() => {
    // Tenta janelas progressivas: hoje → 7 dias → 30 dias → sem limite
    for (const days of [0, 7, 30, null]) {
      const list = buildList(days, googleData, surveyData);
      if (list.length >= MIN_ITEMS || days === null) {
        return list.sort(() => Math.random() - 0.5);
      }
    }
    return [];
  }, [googleData, surveyData]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx((i) => (i + 1) % items.length); setVisible(true); }, 400);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, intervalMs]);

  if (items.length === 0) return null;

  const item = items[idx % items.length];
  const text = item.text.length > MAX_TEXT ? item.text.slice(0, MAX_TEXT).trimEnd() + '…' : item.text;
  const sentimentColor = item.sentiment === 'positive' ? 'text-green-500' : item.sentiment === 'negative' ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={14} className="text-brand-500" />
          <h2 className="text-xs font-semibold text-gray-800 dark:text-white uppercase tracking-wider">Últimas avaliações</h2>
        </div>
        {/* Indicadores */}
        <div className="flex gap-1">
          {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
            <div key={i} className={clsx('h-1 rounded-full transition-all duration-300', i === idx % Math.min(items.length, 8) ? 'w-4 bg-brand-500' : 'w-1 bg-gray-200 dark:bg-gray-600')} />
          ))}
        </div>
      </div>

      {/* Conteúdo com fade */}
      <div className="transition-opacity duration-300" style={{ opacity: visible ? 1 : 0 }}>
        {/* Badge + nota + data */}
        <div className="flex items-center gap-2 mb-2">
          {item.source === 'google' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-700 rounded-full px-2 py-0.5">
              <Star size={9} className="fill-yellow-500" /> Google
            </span>
          ) : (
            <span className={clsx('inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5',
              item.sentiment === 'positive' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700'
              : item.sentiment === 'negative' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700'
            )}>
              <MessageSquare size={9} /> Survey
            </span>
          )}
          {item.source === 'google' ? <Stars rating={item.score} /> : (
            <span className={clsx('text-[10px] font-bold', sentimentColor)}>{Math.round((item.score / 5) * 10)}/10</span>
          )}
          <span className="text-[10px] text-gray-400 ml-auto">
            {item.date ? new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}
          </span>
        </div>

        {/* Autor */}
        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{item.author}</p>

        {/* Texto */}
        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">"{text}"</p>
      </div>
    </div>
  );
}
