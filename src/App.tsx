import { useState, useCallback, useMemo, useEffect } from 'react';

// ── Seed de colaboradores — roda uma vez por browser em qualquer página ────────
const LS_STAFF_KEY      = 'hibiscus-staff';
const LS_STAFF_SEED_KEY = 'hibiscus-staff-seeded-v1';
const SEED_STAFF = [
  { name: 'Katherine', sector: 'ATENDIMENTO', aliases: ['catarine', 'catarina', 'katherine'] },
  { name: 'Dudu',      sector: 'ATENDIMENTO' },
  { name: 'Bruno',     sector: 'A&B' },
  { name: 'Carlos',    sector: 'A&B' },
  { name: 'Luciano',   sector: 'A&B' },
];
function ensureStaffSeed() {
  if (localStorage.getItem(LS_STAFF_SEED_KEY)) return;
  const seeded = SEED_STAFF.map((m, i) => ({ ...m, id: String(1000 + i) }));
  localStorage.setItem(LS_STAFF_KEY, JSON.stringify(seeded));
  localStorage.setItem(LS_STAFF_SEED_KEY, '1');
}
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Overview } from './pages/Overview';
import { Sales } from './pages/Sales';
import { Satisfaction } from './pages/Satisfaction';
import { Reviews } from './pages/Reviews';
import { Occupancy } from './pages/Occupancy';
import { OccupancyInput } from './pages/OccupancyInput';
import { Rh } from './pages/Rh';
import { Cozinha } from './pages/Cozinha';
import { Portaria } from './pages/Portaria';
import { Fluxo } from './pages/Fluxo';
import { Chamadas } from './pages/Chamadas';
import { GoalEditor } from './components/GoalEditor';
import { KdsController, KdsProgressBar, KdsBadge } from './components/KdsMode';
import { BottomNav } from './components/BottomNav';
import { Period, ApiStatus } from './types';
import { useMockMode } from './hooks/useMockMode';
import { useGoals } from './hooks/useGoals';
import { useOccupancy } from './hooks/useOccupancy';
import { useSurveyMonkey } from './hooks/useSurveyMonkey';
import { useGoogleBusiness } from './hooks/useGoogleBusiness';
import { usePaytour } from './hooks/usePaytour';
import { invalidatePaytourCache } from './services/paytour';

const KDS_INTERVAL_MS = 8000;

function Dashboard() {
  useEffect(() => { ensureStaffSeed(); }, []);
  const [period, setPeriod]       = useState<Period>('today');
  const [lastSync, setLastSync]   = useState<Date | null>(new Date());
  const [darkMode, setDarkMode]   = useState(false);
  const [kdsMode, setKdsMode]     = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goals, setGoals]         = useGoals();
  const [occupancy, occupancyActions] = useOccupancy();
  const isMock = useMockMode();

  const { loading: smL, error: smErr, data: smData }               = useSurveyMonkey(period);
  const { loading: gL,  error: gErr, notConfigured: gNC, data: gData } = useGoogleBusiness(period);
  const { loading: ptL, error: ptErr }                              = usePaytour('today');

  const apiStatus: ApiStatus = useMemo(() => ({
    surveymonkey: smL ? 'loading' : smErr           ? 'error' : 'connected',
    google:       gL  ? 'loading' : (gErr && !gNC) ? 'error' : 'connected',
    paytour:      ptL ? 'loading' : ptErr           ? 'error' : 'connected',
  }), [smL, smErr, gL, gErr, gNC, ptL, ptErr]);

  const occupancyAlerts = [
    occupancy.beach / 500 >= 0.9 ? 1 : 0,
    occupancy.lounges.filter(l => l / 10 >= 0.9).length,
    occupancy.prime / 10 >= 0.9 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const sidebarAlerts = useMemo(() => {
    const periodTotal  = smData?.surveys[0]?.responses ?? 0;
    const surveyAlerts = smData ? Math.round((smData.detractors / 100) * periodTotal) : 0;
    const reviewsAlerts = gData?.unansweredCount ?? 0;
    const overviewAlerts = surveyAlerts + reviewsAlerts + occupancyAlerts;
    return { overview: overviewAlerts, survey: surveyAlerts, reviews: reviewsAlerts };
  }, [smData, gData, occupancyAlerts]);

  const handleRefresh    = useCallback(() => { invalidatePaytourCache(); setLastSync(new Date()); }, []);
  const handleToggleDark = useCallback(() => {
    setDarkMode((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  return (
    <>
      <KdsController active={kdsMode} intervalMs={KDS_INTERVAL_MS} />
      <div className="min-h-screen bg-gray-200 dark:bg-gray-900 flex flex-col">
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
          <main className="flex-1 overflow-y-auto pb-[56px] lg:pb-0 flex flex-col">
            {isMock && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 text-center">
                Modo Mock ativo — dados simulados para desenvolvimento
              </div>
            )}
            {kdsMode
              ? <Overview period={period} goals={goals} occupancy={occupancy} />
              : (
                <Routes>
                  <Route path="/"           element={<Overview period={period} goals={goals} occupancy={occupancy} />} />
                  <Route path="/vendas"     element={<Sales period={period} />} />
                  <Route path="/satisfacao" element={<Satisfaction period={period} />} />
                  <Route path="/avaliacoes" element={<Reviews period={period} />} />
                  <Route path="/ocupacao"   element={<Occupancy occupancy={occupancy} actions={occupancyActions} />} />
                  <Route path="/fluxo"     element={<Fluxo />} />
                  <Route path="/chamadas"  element={<Chamadas />} />
                </Routes>
              )
            }
          </main>
        </div>
        <KdsProgressBar active={kdsMode} intervalMs={KDS_INTERVAL_MS} />
        <KdsBadge active={kdsMode} />
      </div>

      {!kdsMode && (
        <BottomNav
          occupancyAlerts={occupancyAlerts}
          overviewAlerts={sidebarAlerts.overview}
          surveyAlerts={sidebarAlerts.survey}
          reviewsAlerts={sidebarAlerts.reviews}
        />
      )}

      {goalsOpen && (
        <GoalEditor goals={goals} onSave={setGoals} onClose={() => setGoalsOpen(false)} />
      )}

      <footer className="fixed bottom-2 left-0 right-0 z-40 text-center py-2 text-[10px] text-gray-400 dark:text-gray-500 select-none leading-tight bg-transparent">
        <span className="opacity-70">Desenvolvido por</span>{' '}
        <span className="font-semibold text-gray-500 dark:text-gray-400">H8 Publicis</span>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/entrada"  element={<OccupancyInput />} />
        <Route path="/rh"       element={<Rh />} />
        <Route path="/cozinha"  element={<Cozinha />} />
        <Route path="/portaria" element={<Portaria />} />
        <Route path="/*"        element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
