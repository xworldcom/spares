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
import { parsePartsList } from "@/lib/parts";

type ListMode = "file" | "rows";

function FileDrop({
  id,
  label,
  hint,
  accept,
  file,
  onFile,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const next = event.dataTransfer.files[0];
        if (next) {
          onFile(next);
        }
      }}
      className={`block cursor-pointer rounded-[22px] px-4 py-5 ring-1 ring-black/8 ${
        over ? "bg-[#eceef2]" : "bg-[#f4f5f7]"
      }`}
    >
      <span className="block text-sm font-medium text-neutral-950">{label}</span>
      <span className="spares-muted mt-1 block text-sm leading-relaxed">{hint}</span>
      <span className="mt-3 inline-flex h-11 items-center rounded-full bg-[#0b0d10] px-4 text-sm font-semibold text-[#fff]">
        {file ? "Replace file" : "Choose file"}
      </span>
      {file ? (
        <span className="mt-2 block truncate font-mono text-[13px] text-neutral-700">
          {file.name}
        </span>
      ) : null}
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

export function UploadPackForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [model, setModel] = useState<File | null>(null);
  const [listMode, setListMode] = useState<ListMode>("file");
  const [partsListFile, setPartsListFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<PartsListRow[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!partsListFile) {
      setPreviewRows([]);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    partsListFile
      .text()
      .then((text) => {
        if (cancelled) {
          return;
        }
        const parsed = parsePartsList(text, partsListFile.name);
        setPreviewRows(parsed);
        setPreviewError(null);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }
        setPreviewRows([]);
        setPreviewError(
          cause instanceof Error ? cause.message : "Could not read that parts list.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [partsListFile]);

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
      setError("Name the machine.");
      return;
    }
    if (!model) {
      setError("Add a GLB or GLTF model.");
      return;
    }

    let partsList: File | null = null;
    if (listMode === "file") {
      partsList = partsListFile;
      if (!partsList) {
        setError("Add a parts list file.");
        return;
      }
      if (previewError) {
        setError(previewError);
        return;
      }
    } else {
      if (validRows.length === 0) {
        setError("Add at least one part number and name.");
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
        className="space-y-4"
      >
        <section className="space-y-4 rounded-[24px] bg-white p-5">
          <p className="text-[11px] font-medium tracking-[0.16em] text-neutral-500 uppercase">
            1 · Where it lives
          </p>
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
              placeholder="Palletizer 4"
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
        </section>

        <section className="space-y-3 rounded-[24px] bg-white p-5">
          <p className="text-[11px] font-medium tracking-[0.16em] text-neutral-500 uppercase">
            2 · 3D model
          </p>
          <FileDrop
            id="model-file"
            label="GLB or GLTF"
            hint="Export from SolidWorks, Inventor, Fusion, or Blender. Native CAD files (STEP, SLDASM) cannot run in the browser."
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            file={model}
            onFile={setModel}
          />
        </section>

        <section className="space-y-3 rounded-[24px] bg-white p-5">
          <p className="text-[11px] font-medium tracking-[0.16em] text-neutral-500 uppercase">
            3 · Parts list
          </p>
          <p className="spares-muted text-sm leading-relaxed">
            CSV, TSV, or JSON from the BOM. Columns can be Part Number /
            Description / Qty — we join those names to meshes in the model.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setListMode("file")}
              className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${
                listMode === "file" ? "btn-primary" : "btn-soft"
              }`}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setListMode("rows")}
              className={`inline-flex h-11 items-center justify-center rounded-full text-sm font-medium ${
                listMode === "rows" ? "btn-primary" : "btn-soft"
              }`}
            >
              Type rows
            </button>
          </div>

          {listMode === "file" ? (
            <div className="space-y-3">
              <FileDrop
                id="parts-file"
                label="BOM or parts list"
                hint="CSV, TSV, or JSON. Headers like Part Number, Description, Quantity, Mesh Name all work."
                accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,application/json"
                file={partsListFile}
                onFile={setPartsListFile}
              />
              {previewError ? (
                <p className="text-sm text-red-700" role="alert">
                  {previewError}
                </p>
              ) : null}
              {previewRows.length > 0 ? (
                <div className="overflow-x-auto rounded-[18px] bg-[#f4f5f7] px-3 py-3">
                  <p className="text-[13px] font-medium text-neutral-800">
                    {previewRows.length} part
                    {previewRows.length === 1 ? "" : "s"} ready to join
                  </p>
                  <ul className="mt-2 space-y-1">
                    {previewRows.slice(0, 6).map((row) => (
                      <li
                        key={`${row.partNumber}-${row.name}`}
                        className="flex justify-between gap-3 text-[13px]"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-neutral-700">
                            {row.partNumber}
                          </span>
                          <span className="text-neutral-500"> · {row.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-neutral-500">
                          ×{row.qty}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {previewRows.length > 6 ? (
                    <p className="spares-muted mt-2 text-[12px]">
                      +{previewRows.length - 6} more
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-2 gap-2 rounded-[20px] bg-[#f4f5f7] p-3"
                >
                  <label className="col-span-2 block text-xs font-medium text-neutral-500">
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
                  <label className="col-span-2 block text-xs font-medium text-neutral-500">
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
        </section>

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
          {submitting ? "Joining pack…" : "Upload pack"}
        </button>
      </form>

      {result ? (
        <div className="space-y-3 rounded-[24px] bg-white p-5">
          <p className="text-[17px] font-semibold text-neutral-900">
            Pack uploaded: {result.name}
          </p>
          <p className="spares-muted text-sm">
            {result.parts.length} joined part
            {result.parts.length === 1 ? "" : "s"}
            {result.company && result.siteName
              ? ` · ${siteLabel({ company: result.company, name: result.siteName })}`
              : ""}
            .
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
