"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { UnmatchedMeshes } from "@/components/machine/UnmatchedMeshes";
import { siteLabel } from "@/lib/access";
import { listSites } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import { uploadMachinePack } from "@/lib/api/machines";
import type { MachineDetail, PartsListRow, Site } from "@/lib/api/types";
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
  const [siteId, setSiteId] = useState("");
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    let cancelled = false;
    listSites()
      .then((next) => {
        if (!cancelled) {
          setSites(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
        siteId: siteId || undefined,
      });
      setResult(machine);
    } catch (cause) {
      setError(errorMessage(cause, "Upload or join failed."));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "mt-1.5 h-12 w-full rounded-2xl border-0 bg-[#f4f5f7] px-4 text-[16px] outline-none";

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-5 rounded-[24px] bg-white p-5"
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
            className={fieldClass}
            placeholder="Press 4 — Line 2"
          />
        </div>

        <div>
          <label htmlFor="machine-site" className="block text-sm font-medium">
            Plant
          </label>
          <select
            id="machine-site"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            className={fieldClass}
          >
            <option value="">Unassigned — staff only</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {siteLabel(site)}
              </option>
            ))}
          </select>
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
            className="mt-1.5 block w-full text-[15px] file:mr-3 file:h-11 file:rounded-full file:border-0 file:bg-[#0b0d10] file:px-4 file:text-sm file:font-semibold file:text-[#fff]"
          />
          <p className="spares-muted mt-2 text-sm leading-relaxed">
            Browser-ready GLB or GLTF. Sample packs live under
            public/placeholders.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Parts list</legend>
          <p className="spares-muted text-sm leading-relaxed">
            Join key is part number. Include qty so it reads like a BOM.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label
              className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${
                listMode === "rows" ? "btn-primary" : "btn-soft"
              }`}
            >
              <input
                type="radio"
                name="list-mode"
                checked={listMode === "rows"}
                onChange={() => setListMode("rows")}
                className="sr-only"
              />
              Enter rows
            </label>
            <label
              className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${
                listMode === "file" ? "btn-primary" : "btn-soft"
              }`}
            >
              <input
                type="radio"
                name="list-mode"
                checked={listMode === "file"}
                onChange={() => setListMode("file")}
                className="sr-only"
              />
              Upload file
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
                className="mt-1.5 block w-full text-[15px] file:mr-3 file:h-11 file:rounded-full file:border-0 file:bg-[#eceef2] file:px-4 file:text-sm file:font-medium"
              />
              <p className="spares-muted mt-2 text-sm">
                CSV or JSON: partNumber, name, qty, meshName.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 gap-2 rounded-[20px] bg-[#f4f5f7] p-3"
                >
                  <label className="block text-xs font-medium text-neutral-500">
                    Part number
                    <input
                      aria-label={`Part number ${index + 1}`}
                      value={row.partNumber}
                      onChange={(event) =>
                        updateRow(index, { partNumber: event.target.value })
                      }
                      className="mt-1 h-11 w-full rounded-2xl border-0 bg-white px-3 font-mono text-[15px] outline-none"
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-500">
                    Name
                    <input
                      aria-label={`Name ${index + 1}`}
                      value={row.name}
                      onChange={(event) =>
                        updateRow(index, { name: event.target.value })
                      }
                      className="mt-1 h-11 w-full rounded-2xl border-0 bg-white px-3 text-[16px] outline-none"
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-500">
                    Qty
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
                      className="mt-1 h-11 w-full rounded-2xl border-0 bg-white px-3 text-[16px] tabular-nums outline-none"
                    />
                  </label>
                  <label className="block text-xs font-medium text-neutral-500">
                    Mesh name
                    <input
                      aria-label={`Mesh name ${index + 1}`}
                      value={row.meshName ?? ""}
                      onChange={(event) =>
                        updateRow(index, { meshName: event.target.value })
                      }
                      className="mt-1 h-11 w-full rounded-2xl border-0 bg-white px-3 font-mono text-[15px] outline-none"
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRows((current) => [...current, emptyPartsRow()])}
                className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
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
          className="btn-primary inline-flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold disabled:opacity-60 sm:w-auto sm:px-5"
        >
          {submitting ? "Uploading…" : "Upload pack"}
        </button>
      </form>

      {result ? (
        <div className="space-y-3 rounded-[24px] bg-white p-5">
          <p className="text-[17px] font-semibold text-neutral-900">
            Pack uploaded: {result.name}
          </p>
          <p className="spares-muted text-sm">
            {result.parts.length} joined part
            {result.parts.length === 1 ? "" : "s"}. Unmatched meshes are listed
            below and stay visible to staff.
          </p>
          <UnmatchedMeshes unmatched={result.unmatched ?? []} />
          <button
            type="button"
            onClick={() => router.push(`/machines/${result.id}`)}
            className="btn-primary inline-flex h-12 items-center rounded-full px-5 text-[16px] font-semibold"
          >
            Open machine
          </button>
        </div>
      ) : null}
    </div>
  );
}
