"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { UnmatchedMeshes } from "@/components/machine/UnmatchedMeshes";
import { errorMessage } from "@/lib/api/errors";
import { uploadMachinePack } from "@/lib/api/machines";
import type { MachineDetail, PartsListRow } from "@/lib/api/types";
import { emptyPartsRow, partsListToJsonFile } from "@/lib/parts-list";

type ListMode = "rows" | "file";

export function UploadPackForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [model, setModel] = useState<File | null>(null);
  const [listMode, setListMode] = useState<ListMode>("rows");
  const [partsListFile, setPartsListFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PartsListRow[]>([emptyPartsRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MachineDetail | null>(null);

  const validRows = useMemo(
    () =>
      rows.filter(
        (row) => row.partNumber.trim() !== "" && row.name.trim() !== "",
      ),
    [rows],
  );

  function updateRow(index: number, patch: Partial<PartsListRow>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!name.trim()) {
      setError("Machine name is required.");
      return;
    }
    if (!model) {
      setError("A GLB or GLTF 3D file is required.");
      return;
    }

    let partsList: File | null = null;
    if (listMode === "file") {
      partsList = partsListFile;
      if (!partsList) {
        setError("Upload a parts list CSV or JSON file.");
        return;
      }
    } else {
      if (validRows.length === 0) {
        setError("Add at least one parts-list row with a part number and name.");
        return;
      }
      partsList = partsListToJsonFile(
        validRows.map((row) => ({
          partNumber: row.partNumber.trim(),
          name: row.name.trim(),
          qty:
            typeof row.qty === "number" && Number.isFinite(row.qty)
              ? row.qty
              : 1,
          meshName: row.meshName?.trim() || undefined,
        })),
      );
    }

    setSubmitting(true);
    try {
      const machine = await uploadMachinePack({
        name: name.trim(),
        model,
        partsList,
      });
      setResult(machine);
    } catch (cause) {
      setError(errorMessage(cause, "Upload or join failed."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <div>
          <label htmlFor="machine-name" className="block text-sm font-medium">
            Machine name
          </label>
          <input
            id="machine-name"
            name="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            placeholder="Press 4 — Line 2"
          />
        </div>

        <div>
          <label htmlFor="model-file" className="block text-sm font-medium">
            3D model (GLB or GLTF)
          </label>
          <input
            id="model-file"
            name="model"
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            required
            onChange={(event) => setModel(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[#0b0d10] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#fff]"
          />
          <p className="mt-1 text-xs text-neutral-500">
            SolidWorks conversion is out of scope. Upload a browser-ready GLB
            or GLTF. Sample packs:{" "}
            <code className="text-neutral-700">
              public/placeholders/palletizer-placeholder.glb
            </code>{" "}
            or{" "}
            <code className="text-neutral-700">
              public/placeholders/hardware/mcmaster-hardware.glb
            </code>
            .
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">ETO-shaped parts list</legend>
          <p className="text-sm text-neutral-600">
            Catalog source of truth is Total ETO (item master + job BOM), not
            SolidWorks custom properties. Join key is part number. Include qty
            so the list reads like a BOM. Matching sample lists:{" "}
            <code className="text-neutral-700">
              public/placeholders/palletizer-parts.csv
            </code>{" "}
            or{" "}
            <code className="text-neutral-700">
              public/placeholders/hardware/mcmaster-hardware-parts.csv
            </code>
            .
          </p>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="list-mode"
                checked={listMode === "rows"}
                onChange={() => setListMode("rows")}
              />
              Enter rows
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="list-mode"
                checked={listMode === "file"}
                onChange={() => setListMode("file")}
              />
              Upload CSV or JSON
            </label>
          </div>

          {listMode === "file" ? (
            <div>
              <label htmlFor="parts-file" className="block text-sm font-medium">
                Parts list file
              </label>
              <input
                id="parts-file"
                name="partsList"
                type="file"
                accept=".csv,.json,text/csv,application/json"
                onChange={(event) =>
                  setPartsListFile(event.target.files?.[0] ?? null)
                }
                className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-200 file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="mt-1 text-xs text-neutral-500">
                CSV headers: partNumber, name, qty, meshName. JSON is an array
                of the same fields.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs tracking-wide text-neutral-500 uppercase">
                  <tr>
                    <th className="pr-2 pb-2 font-medium">Part number</th>
                    <th className="pr-2 pb-2 font-medium">Name</th>
                    <th className="pr-2 pb-2 font-medium">Qty</th>
                    <th className="pb-2 font-medium">Mesh name (optional)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      <td className="pr-2 pb-2">
                        <input
                          aria-label={`Part number ${index + 1}`}
                          value={row.partNumber}
                          onChange={(event) =>
                            updateRow(index, { partNumber: event.target.value })
                          }
                          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                        />
                      </td>
                      <td className="pr-2 pb-2">
                        <input
                          aria-label={`Name ${index + 1}`}
                          value={row.name}
                          onChange={(event) =>
                            updateRow(index, { name: event.target.value })
                          }
                          className="w-full rounded-md border border-neutral-300 px-2 py-1.5"
                        />
                      </td>
                      <td className="pr-2 pb-2">
                        <input
                          aria-label={`Qty ${index + 1}`}
                          type="number"
                          min={1}
                          value={row.qty ?? 1}
                          onChange={(event) =>
                            updateRow(index, {
                              qty: Number(event.target.value) || 1,
                            })
                          }
                          className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 tabular-nums"
                        />
                      </td>
                      <td className="pb-2">
                        <input
                          aria-label={`Mesh name ${index + 1}`}
                          value={row.meshName ?? ""}
                          onChange={(event) =>
                            updateRow(index, { meshName: event.target.value })
                          }
                          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => setRows((current) => [...current, emptyPartsRow()])}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Add row
              </button>
            </div>
          )}
        </fieldset>

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {submitting ? "Uploading…" : "Upload pack"}
        </button>
      </form>

      {result ? (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-sm font-semibold text-neutral-900">
            Pack uploaded: {result.name}
          </p>
          <p className="text-sm text-neutral-600">
            {result.parts.length} joined part
            {result.parts.length === 1 ? "" : "s"}. Unmatched meshes are listed
            below and stay visible to staff.
          </p>
          <UnmatchedMeshes unmatched={result.unmatched ?? []} />
          <button
            type="button"
            onClick={() => router.push(`/machines/${result.id}`)}
            className="btn-primary rounded-full px-4 py-2 text-sm font-medium"
          >
            Open machine
          </button>
        </div>
      ) : null}
    </div>
  );
}
