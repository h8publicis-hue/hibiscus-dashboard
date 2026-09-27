# Prompt de Bootstrapping — Dashboard Hibiscus Mar e Cia

> Cole este documento inteiro no início de uma nova sessão do Claude Code para criar o dashboard do Hibiscus Mar e Cia.

---

## Contexto do Projeto

Você vai criar o **Dashboard Integrado Hibiscus Mar e Cia** — um painel operacional em tempo real para a segunda unidade do Grupo Hibiscus. Este projeto é uma **cópia do dashboard do Hibiscus Beach Club**, já validado em produção, adaptado para a nova unidade.

O repositório de referência está em `/Users/moaferraz/CLAUDIO/DASHINTEGRADO` (Hibiscus Beach Club). Você vai criar um novo projeto do zero, mas seguindo exatamente a mesma arquitetura, stack e padrões. **Não copie arquivos cegamente** — leia o código de referência, entenda a lógica, e reimplemente adaptado ao Mar e Cia.

---

## Stack Tecnológica

- **Frontend:** React 18 + TypeScript + Vite
- **Estilização:** Tailwind CSS + classe `dark:` para dark mode
- **Roteamento:** React Router v6 (`BrowserRouter`)
- **Ícones:** lucide-react
- **Deploy:** Vercel Hobby (Node.js Serverless Functions em `api/`)
- **Banco de dados:** Upstash Redis via REST API (sem SDK — só `fetch`)
- **PDF export:** jsPDF (usado na página de Satisfação e Relatório)
- **Proxy Paytour:** Cloudflare Worker (um Worker por unidade)

---

## Restrição Crítica — NUNCA VIOLAR

```
api/ deve ter EXATAMENTE 12 arquivos .ts
NUNCA criar um 13º arquivo em api/
Toda nova lógica de backend reutiliza endpoints existentes
```

Os 12 arquivos de API são:
1. `api/chamadas.ts`
2. `api/checkin.ts`
3. `api/fluxo-snapshot.ts`
4. `api/fluxo.ts`
5. `api/goals.ts`
6. `api/google-reviews.ts`
7. `api/ocupacao.ts`
8. `api/paytour-faturamento.ts`
9. `api/paytour-orders.ts`
10. `api/portaria.ts`
11. `api/receita-abs.ts`
12. `api/refeicoes.ts`

---

## Estrutura de Pastas

```
hibiscus-mar-e-cia/
├── api/                    ← 12 arquivos exatos (serverless Vercel)
├── src/
│   ├── components/         ← Header, Sidebar, BottomNav, GoalEditor, KdsMode
│   ├── hooks/              ← todos os useXxx.ts
│   ├── pages/              ← uma página por rota
│   ├── services/           ← googleSheets.ts, paytour.ts
│   ├── types/              ← index.ts com todos os tipos e constantes
│   └── App.tsx             ← roteamento + seed de colaboradores
├── public/
│   ├── logo.png            ← logo da unidade
│   └── treinamento.html    ← guia de treinamento (HTML estático)
├── cloudflare-worker/
│   └── worker.js + wrangler.toml
├── vercel.json
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Integrações — Como Funcionam

### Paytour (receita + pedidos + check-in)
- Autenticação: Basic Auth com `APP_KEY:APP_SECRET` → retorna `access_token`
- **Obrigatório:** Cloudflare Worker como proxy (a API Paytour não aceita chamadas diretas do Vercel)
- Worker recebe `x-proxy-secret` em cada requisição para autenticar
- Endpoints usados: `GET /v2/pedidos`, `POST /v2/lojas/login`, `GET /v2/reservas`
- Variáveis: `VITE_PAYTOUR_APP_KEY`, `VITE_PAYTOUR_APP_SECRET`, `PAYTOUR_PROXY_SECRET`
- URL do worker vai em `PT_BASE` dentro dos arquivos `api/paytour-*.ts` e `api/checkin.ts`

**Acumulador mensal (importante):**
O faturamento mensal usa um acumulador Redis. Para meses sem "seed" (snapshot pré-carregado), o sistema captura pedidos da janela de 50 mais recentes e acumula em `ptf-acc-v3:{YYYY-MM}`. Para o primeiro mês de operação não é necessário seed — o sistema começa do zero e acumula automaticamente.

### Google Business (avaliações)
- API: Google Places Details + Reviews
- Variáveis: `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID`
- O `GOOGLE_PLACE_ID` é o identificador único do estabelecimento no Google Maps (encontre em `place.google.com` ou via Google My Business)

### SurveyMonkey via Google Sheets
- O SurveyMonkey exporta respostas para uma planilha Google Sheets
- O sistema lê a planilha via `gviz/tq` (API pública do Google, sem autenticação)
- A planilha deve ter **compartilhamento público** ("qualquer pessoa com o link pode ver")
- Variável: `SHEET_ID` em `src/services/googleSheets.ts`
- Colunas importantes (0-based): data (4), pulseira (11), feedback (12), rating (13)
- Se o formulário tiver colunas em posições diferentes, ajustar os `COL_*` em `googleSheets.ts`

### Upstash Redis (KV)
- Acesso via REST puro (`fetch`) — sem SDK
- Padrão: `GET ${KV_URL}/get/${key}` com `Authorization: Bearer ${KV_TOKEN}`
- Padrão: `POST ${KV_URL}/set/${key}?ex=${ttl}` com body JSON
- Variáveis: `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- **Crie uma nova instância** no Upstash para o Mar e Cia (isolamento total dos dados)
- Chaves usadas: `ocupacao`, `dashboard:goals`, `dashboard:config`, `escala:{YYYY-MM}`, `reservas:{YYYY-MM-DD}`, `ptf-acc-v3:{YYYY-MM}`, `fluxo-snapshot:{YYYY-MM-DD}`, `chamadas:{YYYY-MM-DD}`

### Receita A&B (Power BI)
- Lê de uma planilha Google Sheets separada (não o SurveyMonkey)
- Em `api/receita-abs.ts` — se o Mar e Cia não tiver este módulo, pode omitir ou retornar `{ revenue: 0 }`

---

## Autenticação

- Sem Firebase, sem JWT server-side
- Senha default: definir em `src/pages/Login.tsx` como `DEFAULT_PASSWORD`
- Login valida via `GET /api/goals?type=config` — senha customizada fica no Redis em `dashboard:config`
- Autenticação armazenada em `localStorage` com chave única da unidade (ex: `hmc-admin-auth-v2`)
- App do Líder (`/lider`) tem senha separada, também no Redis

---

## Páginas e Rotas

| Rota | Página | Descrição | Auth |
|---|---|---|---|
| `/` | Overview | Visão geral do dia | Admin |
| `/vendas` | Sales | Receita Paytour detalhada | Admin |
| `/satisfacao` | Satisfaction | NPS + respostas SurveyMonkey | Admin |
| `/avaliacoes` | Reviews | Avaliações Google Business | Admin |
| `/ocupacao` | Occupancy | Controle de lotação | Admin |
| `/fluxo` | Fluxo | Fluxo de entradas ao longo do dia | Admin |
| `/chamadas` | Chamadas | Chamadas de serviço dos garçons | Admin |
| `/relatorio` | Relatorio | Fechamento do dia + exportar PDF | Admin |
| `/cozinha` | Cozinha | KDS da cozinha | Público |
| `/portaria` | Portaria | Controle de portaria/hospedagem | Público |
| `/lider` | Lider | Escala + ponto da equipe | Senha própria |
| `/entrada` | OccupancyInput | Tablet da portaria | Público |
| `/refeicao` | Refeicao | Pedidos do refeitório | Público |
| `/refeicao/admin` | RefeicaoAdmin | Gestão do refeitório | Admin |
| `/rh` | Rh | Gestão de colaboradores | Público |
| `/ajuda` | Ajuda | Guia de treinamento (iframe) | Admin |
| `/configuracoes` | Configuracoes | Metas e configurações | Admin |

---

## Constantes a Adaptar para o Mar e Cia

### Capacidades do espaço — `src/types/index.ts`
```ts
// Ajuste conforme a realidade física do Mar e Cia
export const SPACE_CONFIGS = {
  beach:  { name: 'Beach',  max: ???, attention: 0.6, alert: 0.9 },
  lounge: { name: 'Lounge', max: 999, attention: 0.6, alert: 0.9, count: ??, start: ??? },
  prime:  { name: 'Prime',  max: 999, attention: 0.5, alert: 1.0 },
} as const;
```

### Metas default — `src/types/index.ts`
```ts
export const DEFAULT_GOALS: Goals = {
  receitaTotal:   ???,   // meta mensal de receita Paytour (R$)
  atividadesMes:  ???,
  numeroVendas:   ???,
  npsScore:       65,
  notaGoogle:     4.7,
  taxaSatisfacao: 75,
};
```

### Setores de feedback — `src/hooks/useSectors.ts`
```ts
// Ajuste conforme os setores do Mar e Cia
const DEFAULT_SECTORS = [
  'ESTRUTURA', 'ACESSIBILIDADE', 'ATENDIMENTO', 'A&B', ...
];
```

### Canais e veículos — `src/types/index.ts`
```ts
// Adaptar para os parceiros reais do Mar e Cia
canal:   'Balcão' | 'Paytour' | 'Comercial' | 'Diretoria' | ??? | 'Outros' | ''
veiculo: 'TX/UBER/PRIV' | 'Particular' | ??? | 'Não identificado' | ''
```

### Colaboradores — `src/App.tsx`
```ts
// Substituir pela lista real do Mar e Cia
const SEED_STAFF = [
  { name: '...', sector: 'ATENDIMENTO' },
  { name: '...', sector: 'RECREAÇÃO', aliases: ['apelido'] },
  ...
]
// Usar chave única para o localStorage:
const LS_STAFF_KEY      = 'hmc-staff';
const LS_STAFF_SEED_KEY = 'hmc-staff-seeded-v1';
```

---

## Variáveis de Ambiente (`.env.local` local / Vercel em produção)

```bash
# Paytour
VITE_PAYTOUR_APP_KEY=
VITE_PAYTOUR_APP_SECRET=
PAYTOUR_PROXY_SECRET=          # secret do Cloudflare Worker

# Google
GOOGLE_PLACES_API_KEY=
GOOGLE_PLACE_ID=               # ID do estabelecimento no Google Maps

# Upstash Redis
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Firebase (se for usar autenticação futura — opcional)
FIREBASE_API_KEY=
```

---

## Cloudflare Worker — Setup

O Worker atua como proxy entre Vercel e a API Paytour.

`cloudflare-worker/worker.js`:
```js
export default {
  async fetch(request, env) {
    const secret = request.headers.get('x-proxy-secret');
    if (secret !== env.PROXY_SECRET) return new Response('Unauthorized', { status: 401 });

    const url = new URL(request.url);
    const target = 'https://api.paytour.com.br' + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.delete('x-proxy-secret');
    headers.set('Origin', 'https://app.paytour.com.br');
    headers.set('User-Agent', 'Mozilla/5.0');

    return fetch(target, { method: request.method, headers, body: request.body });
  }
}
```

`cloudflare-worker/wrangler.toml`:
```toml
name = "paytour-proxy-mc"        # nome único para o Mar e Cia
main = "worker.js"
compatibility_date = "2024-01-01"
account_id = "SEU_ACCOUNT_ID"

[vars]
PROXY_SECRET = "hmc-GERARUMVALORSECRETOAQUI"
```

Deploy: `wrangler deploy` → anote a URL `https://paytour-proxy-mc.SEU_DOMINIO.workers.dev`

---

## `vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/sheets-api/:path*", "destination": "https://docs.google.com/:path*" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" },
        { "key": "Pragma", "value": "no-cache" },
        { "key": "Expires", "value": "0" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate, max-age=0" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/api/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "no-store" }]
    }
  ],
  "crons": [
    { "path": "/api/checkin?action=keepalive",   "schedule": "0 6 * * *" },
    { "path": "/api/fluxo-snapshot?action=save", "schedule": "0 21 * * *" }
  ],
  "functions": {
    "api/paytour-faturamento.ts": { "regions": ["gru1"] },
    "api/paytour-orders.ts":      { "regions": ["gru1"] }
  }
}
```

---

## Padrões de Código a Seguir

### Acesso ao Redis — sempre assim:
```ts
async function kvGet(key: string) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const j = await r.json() as any;
    const raw = j?.result;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return null; }
}

async function kvSet(key: string, value: unknown, ttlSec: number) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?ex=${ttlSec}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(value),
    });
  } catch { /* ignore */ }
}
```

### Segurança — NUNCA:
```ts
// ERRADO — nunca hardcode secrets
const PROXY_SECRET = 'hmc-16690e52666d921f1dceb35a';

// CERTO — sempre via env var
const PROXY_SECRET = process.env.PAYTOUR_PROXY_SECRET ?? '';
```

### Hooks de dados — padrão:
```ts
export function useDados() {
  const [data, setData]       = useState<Tipo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/endpoint')
      .then(r => r.json())
      .then(j => { if (!cancelled) { setData(j); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
```

### Componentes — padrão sidebar + mobile:
- Desktop: `Sidebar.tsx` com `hidden lg:flex` (só aparece em telas grandes)
- Mobile: `BottomNav.tsx` com gaveta "Mais" para itens secundários
- Itens principais (visíveis diretamente no BottomNav): máximo 4
- Itens secundários (na gaveta): todos os demais

---

## Checklist de Implementação

### Fase 1 — Scaffold
- [ ] `git init` + `npm create vite@latest` (React + TypeScript)
- [ ] Instalar dependências: `tailwindcss`, `react-router-dom`, `lucide-react`, `clsx`, `jspdf`
- [ ] Configurar `tailwind.config.js` com a cor `brand` (verde Hibiscus: `#2ecc71`)
- [ ] Criar `vercel.json`
- [ ] Criar `.env.local` com variáveis vazias

### Fase 2 — Tipos e Config
- [ ] `src/types/index.ts` com tipos base e `SPACE_CONFIGS` / `DEFAULT_GOALS` do Mar e Cia
- [ ] `src/hooks/useSectors.ts` com setores do Mar e Cia

### Fase 3 — APIs (12 arquivos exatos)
- [ ] Copiar lógica dos 12 arquivos do Beach Club adaptando URLs e secrets
- [ ] Ajustar `PT_BASE` para a URL do Worker do Mar e Cia em todos os `api/paytour-*.ts`
- [ ] Verificar: `ls api/ | wc -l` === 12

### Fase 4 — Hooks
- [ ] Copiar todos os hooks de `src/hooks/` — a lógica é idêntica, só muda via env vars

### Fase 5 — Componentes e Páginas
- [ ] Copiar componentes (`Header`, `Sidebar`, `BottomNav`, etc.)
- [ ] Copiar páginas adaptando nome da unidade
- [ ] Substituir `SEED_STAFF` pelos colaboradores do Mar e Cia
- [ ] Substituir logo, nome e chaves `localStorage`

### Fase 6 — Infraestrutura
- [ ] Deploy Cloudflare Worker: `wrangler deploy`
- [ ] Criar instância Redis no Upstash
- [ ] Criar projeto no Vercel → conectar ao repositório GitHub
- [ ] Configurar env vars no Vercel
- [ ] Primeiro deploy e teste end-to-end

---

## Informações que Você Precisa Coletar Antes de Começar

Antes de implementar, confirme com o cliente:

1. **Capacidade física** — quantas pessoas o espaço comporta? Tem lounges numerados? Quantos? A partir de qual número?
2. **Lista de colaboradores** — nome completo, setor (ATENDIMENTO, RECREAÇÃO, COZINHA, etc.) e apelidos
3. **Metas mensais** — receita Paytour esperada, NPS alvo
4. **Credenciais Paytour** — app key e secret da conta do Mar e Cia
5. **Place ID do Google Business** — do perfil do Mar e Cia no Google Maps
6. **Planilha de satisfação** — ID do Google Sheets (ou criar nova com o mesmo formulário SurveyMonkey)
7. **Logo** — arquivo PNG da unidade (fundo transparente, horizontal)
8. **Parceiros transportadores** — para os tipos de veículo no campo de reservas de lounge
9. **Senha inicial** — para o login do dashboard e do App do Líder
10. **Domínio ou subdomínio** — onde o dashboard vai rodar (ex: `dashboard-mc.hibiscusbeachclub.com.br`)

---

## Primeira Mensagem Recomendada Após Colar Este Documento

```
Leu o documento acima? Antes de criar qualquer arquivo, me confirme:
1. Quais das informações da seção "O Que Você Precisa Coletar" já temos?
2. Podemos começar pelo scaffold (Fase 1) enquanto as informações restantes chegam?
```
