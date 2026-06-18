import { useState, useCallback, useMemo } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Overview } from './pages/Overview';
import { Sales } from './pages/Sales';
import { Satisfaction } from './pages/Satisfaction';
import { Reviews } from './pages/Reviews';
import { Occupancy } from './pages/Occupancy';
import { GoalEditor } from './components/GoalEditor';
import { KdsController, KdsProgressBar, KdsBadge } from './components/KdsMode';
import { ReviewsTicker } from './components/ReviewsTicker';
import { Period, ApiStatus } from './types';
import { useMockMode } from './hooks/useMockMode';
import { useGoals } from './hooks/useGoals';
import { useOccupancy } from './hooks/useOccupancy';
import { useSurveyMonkey } from './hooks/useSurveyMonkey';
import { useGoogleBusiness } from './hooks/useGoogleBusiness';

const KDS_INTERVAL_MS = 8000;

export default function App() {
  const [period, setPeriod]       = useState<Period>('today');
  const [lastSync, setLastSync]   = useState<Date | null>(new Date());
  const [darkMode, setDarkMode]   = useState(false);
  const [kdsMode, setKdsMode]     = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goals, setGoals]         = useGoals();
  const [occupancy, occupancyActions] = useOccupancy();
  const isMock = useMockMode();

  // Real API status + data — hooks share the same cache layer as child pages (no extra requests)
  const { loading: smL, error: smErr, data: smData }               = useSurveyMonkey(period);
  const { loading: gL,  error: gErr, notConfigured: gNC, data: gData } = useGoogleBusiness(period);

  const apiStatus: ApiStatus = useMemo(() => ({
    surveymonkey: smL ? 'loading' : smErr           ? 'error' : 'connected',
    google:       gL  ? 'loading' : (gErr && !gNC) ? 'error' : 'connected',
  }), [smL, smErr, gL, gErr, gNC]);

  // ── Sidebar alerts (todos dinâmicos) ─────────────────────────────────────────
  // Ocupação: espaços ≥ 90% de capacidade
  const occupancyAlerts = [
    occupancy.beach / 500 >= 0.9 ? 1 : 0,
    occupancy.lounges.filter(l => l / 10 >= 0.9).length,
    occupancy.prime / 10 >= 0.9 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const sidebarAlerts = useMemo(() => {
    // Survey: detratores no período (nota ≤ 3)
    const periodTotal  = smData?.surveys[0]?.responses ?? 0;
    const surveyAlerts = smData
      ? Math.round((smData.detractors / 100) * periodTotal)
      : 0;

    // Avaliações: avaliações do Google sem resposta
    const reviewsAlerts = gData?.unansweredCount ?? 0;

    // Visão Geral: soma de todos os alertas
    const overviewAlerts = surveyAlerts + reviewsAlerts + occupancyAlerts;

    return { overview: overviewAlerts, survey: surveyAlerts, reviews: reviewsAlerts };
  }, [smData, gData, occupancyAlerts]);

  const handleRefresh    = useCallback(() => { setLastSync(new Date()); }, []);
  const handleToggleDark = useCallback(() => {
    setDarkMode((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  return (
    <BrowserRouter>
      <KdsController active={kdsMode} intervalMs={KDS_INTERVAL_MS} />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <Header
          period={period}
          onPeriodChange={setPeriod}
          onRefresh={handleRefresh}
          lastSync={lastSync}
          apiStatus={apiStatus}
          darkMode={darkMode}
          onToggleDark={handleToggleDark}
          kdsMode={kdsMode}
          onToggleKds={() => setKdsMode((k) => !k)}
          onEditGoals={() => setGoalsOpen(true)}
        />
        <div className="flex flex-1 overflow-hidden">
          {!kdsMode && (
            <Sidebar
              occupancyAlerts={occupancyAlerts}
              overviewAlerts={sidebarAlerts.overview}
              surveyAlerts={sidebarAlerts.survey}
              reviewsAlerts={sidebarAlerts.reviews}
            />
          )}
          <main className="flex-1 overflow-y-auto pb-[72px]">
            {isMock && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 text-center">
                Modo Mock ativo — dados simulados para desenvolvimento
              </div>
            )}
            <Routes>
              <Route path="/"           element={<Overview period={period} goals={goals} occupancy={occupancy} />} />
              <Route path="/vendas"     element={<Sales period={period} />} />
              <Route path="/satisfacao" element={<Satisfaction period={period} />} />
              <Route path="/avaliacoes" element={<Reviews period={period} />} />
              <Route path="/ocupacao"   element={<Occupancy occupancy={occupancy} actions={occupancyActions} />} />
            </Routes>
          </main>
        </div>
        <KdsProgressBar active={kdsMode} intervalMs={KDS_INTERVAL_MS} />
        <KdsBadge active={kdsMode} />
      </div>

      <ReviewsTicker
        googleData={gData}
        surveyData={smData}
      />

      {goalsOpen && (
        <GoalEditor goals={goals} onSave={setGoals} onClose={() => setGoalsOpen(false)} />
      )}
    </BrowserRouter>
  );
}
