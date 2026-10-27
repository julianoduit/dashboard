import type { Conta } from '../api/types';
import { PRESETS, type Periodo, type PresetId } from '../lib/periods';

interface Props {
  contas: Conta[];
  contaId: number | undefined;
  onConta: (id: number) => void;
  preset: PresetId;
  periodo: Periodo;
  onPreset: (p: PresetId) => void;
  onCustom: (p: Periodo) => void;
  maxData: string;
}

/** Uma única linha de filtros acima de tudo o que eles afetam. */
export function Filters({ contas, contaId, onConta, preset, periodo, onPreset, onCustom, maxData }: Props) {
  return (
    <div className="filters" role="group" aria-label="Filtros">
      {contas.length > 1 ? (
        <label className="field">
          <span className="field__label">Conta</span>
          <select className="select" value={contaId ?? ''} onChange={(e) => onConta(Number(e.target.value))}>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="field">
        <span className="field__label">Período</span>
        <select className="select" value={preset} onChange={(e) => onPreset(e.target.value as PresetId)}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </label>

      {preset === 'custom' ? (
        <div className="custom-range">
          <label className="field">
            <span className="field__label">De</span>
            <input
              className="input"
              type="date"
              value={periodo.inicio}
              max={periodo.fim}
              onChange={(e) => e.target.value && onCustom({ inicio: e.target.value, fim: periodo.fim })}
            />
          </label>
          <label className="field">
            <span className="field__label">Até</span>
            <input
              className="input"
              type="date"
              value={periodo.fim}
              min={periodo.inicio}
              max={maxData}
              onChange={(e) => e.target.value && onCustom({ inicio: periodo.inicio, fim: e.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
