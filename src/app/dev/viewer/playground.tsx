"use client";

import { useMemo, useState } from "react";
import { PartPicker } from "@/components/viewer";
import type { UnmatchedMesh, ViewerPart } from "@/components/viewer";
import packRows from "../../../../public/placeholders/palletizer-parts.json";

const MODEL_SRC = "/placeholders/palletizer-placeholder.glb";

const JOINED_IDS = new Set([
  "PN-FRAME-1000",
  "PN-ROLL-2104",
  "PN-MTR-3301",
]);

function toViewerPart(row: (typeof packRows)[number]): ViewerPart {
  return {
    id: row.partNumber,
    name: row.name,
    meshName: row.meshName,
    qty: row.qty,
  };
}

export function ViewerPlayground() {
  const joinedParts = useMemo(
    () =>
      packRows
        .filter((row) => JOINED_IDS.has(row.partNumber))
        .map(toViewerPart),
    [],
  );
  const listOnly = packRows.filter((row) => !JOINED_IDS.has(row.partNumber));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ViewerPart | null>(null);
  const [unmatched, setUnmatched] = useState<UnmatchedMesh | null>(null);

  function handleSelect(part: ViewerPart | null) {
    setSelected(part);
    setSelectedId(part?.id ?? null);
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100 lg:flex-row">
      <section className="relative min-h-[55vh] flex-1 lg:min-h-screen">
        <PartPicker
          src={MODEL_SRC}
          parts={joinedParts}
          selectedId={selectedId}
          onSelect={handleSelect}
          onUnmatchedSelect={setUnmatched}
          className="h-full min-h-[55vh] lg:min-h-screen"
        />
      </section>

      <aside className="w-full max-w-md space-y-5 border-t border-neutral-800 bg-neutral-900 p-5 lg:border-t-0 lg:border-l">
        <p className="text-xs font-medium tracking-wide text-amber-400 uppercase">
          Dev check · private · not live
        </p>
        <div>
          <h1 className="text-xl font-semibold">Placeholder part picker</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Developer-only route. Not a login, staff, or customer screen. Loads
            the T1.1 sample pack: a short palletizer / conveyor infeed plus a
            fake ETO BOM. Production `src` is Brent&apos;s cookie file URL
            (`GET /api/machines/:id/file`); the picker always fetches with
            credentials included.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            Joined parts (customer-pickable)
          </h2>
          <ul className="mt-2 space-y-1">
            {joinedParts.map((part) => {
              const active = selectedId === part.id;
              return (
                <li key={part.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(part.id);
                      setSelected(part);
                      setUnmatched(null);
                    }}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                      active
                        ? "bg-sky-900/70 text-sky-100"
                        : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                    }`}
                  >
                    <span>
                      <span className="font-mono text-xs">{part.id}</span>
                      <span className="mt-0.5 block">{part.name}</span>
                    </span>
                    <span className="text-xs text-neutral-400">
                      qty {part.qty}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            Pack unmatched (staff QA)
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-400">
            {listOnly.map((row) => (
              <li key={row.partNumber} className="rounded bg-neutral-800 px-3 py-2">
                <span className="font-mono text-xs text-neutral-300">
                  {row.partNumber}
                </span>
                <span className="mt-0.5 block">
                  {row.name} · qty {row.qty} · list-only (no mesh)
                </span>
              </li>
            ))}
            <li className="rounded bg-neutral-800 px-3 py-2">
              <span className="font-mono text-xs text-neutral-300">
                PN-GRD-5503
              </span>
              <span className="mt-0.5 block">
                Safety guard · model-only (no BOM row)
              </span>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-medium text-neutral-300">onSelect</h2>
          <pre className="mt-2 overflow-x-auto rounded bg-neutral-950 p-3 text-xs text-sky-200">
            {JSON.stringify(selected, null, 2) ?? "null"}
          </pre>
        </div>
        <div>
          <h2 className="text-sm font-medium text-neutral-300">
            onUnmatchedSelect
          </h2>
          <pre className="mt-2 overflow-x-auto rounded bg-neutral-950 p-3 text-xs text-amber-200">
            {JSON.stringify(unmatched, null, 2) ?? "null"}
          </pre>
        </div>

        <p className="text-xs text-neutral-500">
          Rotate, zoom, and pan the model. Click a named mesh or a list row.
          Click empty space to clear. The yellow guard is not quote-pickable.
        </p>
      </aside>
    </div>
  );
}
