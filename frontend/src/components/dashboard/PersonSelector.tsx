import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { EmptyState } from "../ui";

export type PersonSelectorOption = {
  name: string;
  total: number;
  inProgress: number;
  done: number;
  blocked: number;
};

const QUICK_CHIPS_LIMIT = 8;
const SELECT_RENDER_LIMIT = 160;

export default function PersonSelector({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: PersonSelectorOption[];
  value: string;
  onChange: (personName: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filteredOptions = useMemo(() => {
    if (!deferredQuery) return options;
    return options.filter((item) => item.name.toLowerCase().includes(deferredQuery));
  }, [options, deferredQuery]);

  if (options.length === 0) {
    return (
      <div className="person-selector-panel">
        <EmptyState
          title="Sem pessoas atribuidas"
          description="As pessoas aparecerao aqui quando houver issues com assignee no snapshot."
          compact
        />
      </div>
    );
  }

  const fallbackSelected = options.find((item) => item.name === value) || options[0];
  const selected = filteredOptions.find((item) => item.name === value) || fallbackSelected;

  const renderedSelectOptions = (() => {
    const base = filteredOptions.slice(0, SELECT_RENDER_LIMIT);
    if (!base.some((item) => item.name === selected.name)) {
      return [selected, ...base].slice(0, SELECT_RENDER_LIMIT);
    }
    return base;
  })();

  const chipOptions = filteredOptions.slice(0, QUICK_CHIPS_LIMIT);
  const hiddenCount = Math.max(0, filteredOptions.length - chipOptions.length);

  return (
    <div className="person-selector-panel">
      <div className="person-selector-panel__header">
        <div>
          <h4>Selecione uma pessoa</h4>
          <p>Renderiza somente metricas e tarefas do responsavel selecionado.</p>
        </div>
        <div className="person-selector-panel__count">{options.length} pessoas com tarefas</div>
      </div>

      <div className="person-selector-toolbar">
        <label className="person-selector-search" aria-label="Buscar pessoa no dashboard">
          <span>Buscar</span>
          <input
            type="search"
            value={query}
            disabled={disabled}
            placeholder="Filtrar por nome"
            onChange={(e) => {
              const next = e.target.value;
              startTransition(() => {
                setQuery(next);
              });
            }}
          />
        </label>

        <div className="person-selector-control">
          <label htmlFor="dashboard-person-select">Pessoa</label>
          <select
            id="dashboard-person-select"
            value={selected.name}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            {renderedSelectOptions.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.total})
              </option>
            ))}
          </select>
          {filteredOptions.length > SELECT_RENDER_LIMIT ? (
            <small className="person-selector-control__hint">
              Mostrando {SELECT_RENDER_LIMIT} de {filteredOptions.length} resultados. Refine a busca.
            </small>
          ) : null}
        </div>
      </div>

      {filteredOptions.length === 0 ? (
        <EmptyState
          title="Nenhuma pessoa encontrada"
          description="Ajuste o filtro para encontrar o responsavel desejado."
          compact
        />
      ) : (
        <>
          <div className="person-selector-chips" role="list" aria-label="Selecao rapida de pessoas">
            {chipOptions.map((item) => {
              const active = item.name === selected.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  className={`person-selector-chip ${active ? "is-active" : ""}`.trim()}
                  onClick={() => onChange(item.name)}
                >
                  <span className="person-selector-chip__name">{item.name}</span>
                  <span className="person-selector-chip__meta">
                    <strong>{item.inProgress}</strong> WIP / {item.done} done / {item.blocked} blk
                  </span>
                </button>
              );
            })}
          </div>

          {hiddenCount > 0 ? (
            <div className="person-selector-panel__footnote">
              +{hiddenCount} pessoas ocultas nos atalhos rapidos. Use a busca/select para navegar.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
