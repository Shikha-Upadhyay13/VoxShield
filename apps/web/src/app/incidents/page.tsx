"use client";

import { actionLabel, bandLabel, clsx, formatClock, formatDuration, modeLabel, sourceLabel } from "@/lib/format";
import { LayerBars } from "@/components/layer-bars";
import { useSession } from "@/store/session-provider";

export default function IncidentsPage() {
  const { incidents, selectedIncidentId, setSelectedIncidentId, clearIncidents } = useSession();
  const selected = incidents.find((i) => i.id === selectedIncidentId) ?? incidents[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-[var(--muted)]">
          Feature-only history. Scores, reasons, and actions — not recordings.
        </p>
        <button
          type="button"
          onClick={clearIncidents}
          className="text-xs text-[var(--faint)] hover:text-[var(--text)]"
        >
          Clear local history
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[var(--muted)]">
                      No incidents yet. Run a live check or upload a clip.
                    </td>
                  </tr>
                ) : (
                  incidents.map((incident) => {
                    const active = incident.id === selected?.id;
                    return (
                      <tr
                        key={incident.id}
                        onClick={() => setSelectedIncidentId(incident.id)}
                        className={clsx(
                          "cursor-pointer border-b border-[var(--line)] last:border-0",
                          active ? "bg-white/5" : "hover:bg-white/3",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div>{formatClock(incident.timestamp)}</div>
                          <div className="text-[11px] text-[var(--faint)]">{incident.label}</div>
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)]">
                          {sourceLabel(incident.source)}
                          <div className="text-[11px] text-[var(--faint)]">
                            {formatDuration(incident.durationMs)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)]">{modeLabel(incident.mode)}</td>
                        <td className="px-4 py-3">
                          <span className={`band-${incident.result.band} font-mono`}>
                            {incident.result.score}
                          </span>
                          <div className="text-[11px] text-[var(--faint)]">
                            {bandLabel(incident.result.band)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)]">
                          {incident.action ? actionLabel(incident.action) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="card p-5">
          {selected ? (
            <>
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">
                Incident detail
              </div>
              <div className="mt-2 text-sm font-medium">{selected.label}</div>
              <p className="mt-1 text-xs text-[var(--faint)]">
                {formatClock(selected.timestamp)} · {modeLabel(selected.mode)} · features only
              </p>
              {selected.actionReason ? (
                <p className="mt-3 text-sm text-[var(--muted)]">{selected.actionReason}</p>
              ) : null}
              <div className="mt-6">
                <LayerBars layers={selected.result.layers} />
              </div>
              <ul className="mt-6 space-y-2 text-sm text-[var(--muted)]">
                {[...selected.result.layers.acoustic.reasons, ...selected.result.layers.prosody.reasons]
                  .slice(0, 3)
                  .map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select a row to see layer breakdown.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
