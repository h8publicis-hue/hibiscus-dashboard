import { useState } from 'react';
import { Goals } from '../types';
import { X } from 'lucide-react';

interface GoalEditorProps {
  goals: Goals;
  onSave: (next: Goals) => void;
  onClose: () => void;
}

interface Field {
  key: keyof Goals;
  label: string;
  unit: string;
  step: number;
  min: number;
  max: number;
}

const FIELDS: Field[] = [
  { key: 'receitaTotal',   label: 'Receita Total Paytour',  unit: 'R$ / mês',          step: 1000, min: 0,    max: 10000000 },
  { key: 'npsScore',       label: 'NPS Score',              unit: 'pontos',            step: 1,    min: -100, max: 100      },
  { key: 'notaGoogle',     label: 'Nota Google',            unit: 'estrelas',          step: 0.1,  min: 1,    max: 5        },
  { key: 'taxaSatisfacao', label: 'Taxa de Satisfação',     unit: '% promotores',      step: 1,    min: 0,    max: 100      },
];

function fmt(key: keyof Goals, val: number): string {
  if (key === 'receitaTotal') return val.toLocaleString('pt-BR');
  return String(val);
}

export function GoalEditor({ goals, onSave, onClose }: GoalEditorProps) {
  const [draft, setDraft] = useState<Goals>({ ...goals });

  const handleChange = (key: keyof Goals, raw: string) => {
    const num = parseFloat(raw);
    if (!isNaN(num)) setDraft((d) => ({ ...d, [key]: num }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Editar Metas Mensais</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {FIELDS.map(({ key, label, unit, step, min, max }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draft[key]}
                    step={step}
                    min={min}
                    max={max}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap w-24">{unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
