import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Login } from './pages/Login';

// ── Seed de colaboradores — roda uma vez por browser em qualquer página ────────
const LS_STAFF_KEY      = 'hibiscus-staff';
const LS_STAFF_SEED_KEY = 'hibiscus-staff-seeded-v4';
const SEED_STAFF: { name: string; sector: string; aliases?: string[] }[] = [
  { name: 'Alex Ferreira da Silva',              sector: 'ATENDIMENTO' },
  { name: 'Aloisio José dos Santos Junior',      sector: 'ATENDIMENTO' },
  { name: 'Alvaro Silva dos Santos',             sector: 'ATENDIMENTO' },
  { name: 'Arthur Lopes de Lima Silva',          sector: 'ATENDIMENTO' },
  { name: 'Bruno José dos Santos',               sector: 'ATENDIMENTO' },
  { name: 'Bruno Rafael Moreira dos Santos',     sector: 'ATENDIMENTO', aliases: ['bruno rafael'] },
  { name: 'Carlos Eduardo da Silva',             sector: 'ATENDIMENTO', aliases: ['carlos 361', 'carlos eduardo'] },
  { name: 'Catharine Matias da Silva',           sector: 'ATENDIMENTO', aliases: ['catarine', 'catarina', 'katherine'] },
  { name: 'Cicero Eduardo dos Santos Silva',     sector: 'ATENDIMENTO', aliases: ['cícero'] },
  { name: 'Cristiane dos Santos Vitor',          sector: 'ATENDIMENTO' },
  { name: 'Daniel Germano Borges Junior',        sector: 'ATENDIMENTO' },
  { name: 'Daniele Maria Santos da Silva',       sector: 'ATENDIMENTO' },
  { name: 'David Robert Pimentel da Silva',      sector: 'ATENDIMENTO' },
  { name: 'Diogo Luis Rosendo Tavares',          sector: 'ATENDIMENTO' },
  { name: 'Eduardo Santos da Silva',             sector: 'ATENDIMENTO', aliases: ['dudu'] },
  { name: 'Elane Cicera da Silva',               sector: 'ATENDIMENTO' },
  { name: 'Elderson Hiago Silva de Almeida',     sector: 'ATENDIMENTO' },
  { name: 'Eliberg Jose Ferreira dos Santos',    sector: 'ATENDIMENTO' },
  { name: 'Emerson de Sena Feitosa',             sector: 'ATENDIMENTO' },
  { name: 'Everton da Silva Santos',             sector: 'ATENDIMENTO' },
  { name: 'Geidiane Maria Henrique dos Santos',  sector: 'ATENDIMENTO' },
  { name: 'Giullyson Lima da Silva',             sector: 'ATENDIMENTO' },
  { name: 'Jane Cleide Ferreira da Silva',       sector: 'ATENDIMENTO' },
  { name: 'Jefferson Silva dos Santos',          sector: 'ATENDIMENTO' },
  { name: 'Jesser Emanoel de Oliveira',          sector: 'ATENDIMENTO' },
  { name: 'Jose Ulisses Pituba Lins',            sector: 'ATENDIMENTO', aliases: ['ulisses'] },
  { name: 'Lucas dos Santos Romão',              sector: 'ATENDIMENTO', aliases: ['lucas romão'] },
  { name: 'Lucas Mateus Mendes Apolinario',      sector: 'ATENDIMENTO', aliases: ['lucas mateus'] },
  { name: 'Luciano Marcos dos Santos Junior',    sector: 'ATENDIMENTO' },
  { name: 'Lucineia Barros Nascimento dos Santos', sector: 'ATENDIMENTO' },
  { name: 'Marcolino Felix de Lima Neto',        sector: 'ATENDIMENTO' },
  { name: 'Marcos Paulo Santos da Silva',        sector: 'ATENDIMENTO' },
  { name: 'Maria Vanessa de Moura Ferreira',     sector: 'ATENDIMENTO', aliases: ['vanessa'] },
  { name: 'Mazio Pedro dos Santos',              sector: 'ATENDIMENTO' },
  { name: 'Raudney Lins de Santana',             sector: 'ATENDIMENTO' },
  { name: 'Rodrigo Braz de Franca',              sector: 'ATENDIMENTO' },
  { name: 'Taciano Silva dos Santos',            sector: 'ATENDIMENTO' },
  { name: 'Valdja de Moura Ferreira',            sector: 'ATENDIMENTO' },
  { name: 'Wadysson Ferreira da Silva',          sector: 'ATENDIMENTO' },
  { name: 'Williams Faustino Ribeiro',           sector: 'ATENDIMENTO' },
  { name: 'Alessandra da Silva Gonçalves',       sector: 'RECEPÇÃO' },
  { name: 'Cleonice Carolayne Casado dos Santos',sector: 'RECEPÇÃO', aliases: ['carolayne'] },
  { name: 'Josicleide Maria da Silva',           sector: 'RECEPÇÃO' },
  { name: 'Kauany Conceição da Silva Santos',    sector: 'RECEPÇÃO' },
  { name: 'Rairon Alexandre Silva do Nascimento',sector: 'RECEPÇÃO' },
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
import { Refeicao } from './pages/Refeicao';
import { RefeicaoAdmin } from './pages/RefeicaoAdmin';
import { Configuracoes } from './pages/Configuracoes';
import { Relatorio }     from './pages/Relatorio';
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
  const isKiosk = new URLSearchParams(window.location.search).has('kiosk');
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

  // ── Modo Quiosque (?kiosk) — Overview fullscreen sem chrome ─────────────────
  if (isKiosk) {
    return (
      <div className="min-h-screen bg-gray-200 dark:bg-gray-900 overflow-y-auto flex flex-col">
        {/* Header quiosque — só branding, sem controles */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2 shrink-0">
          <img src="/logo.png" alt="Hibiscus Beach Club" className="dark:hidden h-9 w-auto object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <img src="https://static.wixstatic.com/media/d9d863_f674498abfa44751886e72f0229c5f17~mv2.png/v1/crop/x_22,y_1,w_340,h_84/fill/w_476,h_117,fp_0.50_0.50,lg_1,q_85,enc_avif,quality_auto/Prancheta%201%20c%C3%B3pia.png" alt="Hibiscus Beach Club" className="hidden dark:block h-9 w-auto object-contain" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div>
            <h1 className="text-sm font-bold text-brand-600 dark:text-white leading-tight">Hibiscus Beach Club</h1>
            <p className="text-xs text-gray-400">Dashboard Integrado</p>
          </div>
        </header>
        <div className="flex-1">
          <Overview period={period} goals={goals} occupancy={occupancy} />
        </div>
        <footer className="text-center py-2 text-[10px] text-gray-400 dark:text-gray-500 select-none leading-tight">
          <span className="opacity-70">Desenvolvido por</span>{' '}
          <span className="font-semibold text-gray-500 dark:text-gray-400">H8 Publicis</span>
        </footer>
      </div>
    );
  }

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
                  <Route path="/vendas"     element={<Sales />} />
                  <Route path="/satisfacao" element={<Satisfaction period={period} />} />
                  <Route path="/avaliacoes" element={<Reviews period={period} />} />
                  <Route path="/ocupacao"   element={<Occupancy occupancy={occupancy} actions={occupancyActions} />} />
                  <Route path="/fluxo"     element={<Fluxo />} />
                  <Route path="/chamadas"       element={<Chamadas />} />
                  <Route path="/refeicao/admin"   element={<RefeicaoAdmin />} />
                  <Route path="/configuracoes"    element={<Configuracoes />} />
                  <Route path="/relatorio"        element={<Relatorio />} />
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

function ProtectedDashboard() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('hibiscus-admin-auth-v2') === 'ok');
  // useRef para não criar nova referência a cada render
  const handleLogin = useRef(() => setAuthed(true)).current;

  if (!authed) return <Login onLogin={handleLogin} />;
  return <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/entrada"  element={<OccupancyInput />} />
        <Route path="/rh"       element={<Rh />} />
        <Route path="/cozinha"  element={<Cozinha />} />
        <Route path="/portaria" element={<Portaria />} />
        <Route path="/refeicao" element={<Refeicao />} />
        <Route path="/*"        element={<ProtectedDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
