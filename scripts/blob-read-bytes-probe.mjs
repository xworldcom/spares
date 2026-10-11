#!/usr/bin/env node
/**
 * Measure X-Spares-Blob-Read-Bytes on list APIs (warm vs cold instance).
 *
 * Usage:
 *   SPARES_PROBE_BASE=https://oee360.com SPARES_PROBE_COOKIE='session=…' node scripts/blob-read-bytes-probe.mjs
 */
const base = (process.env.SPARES_PROBE_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const cookie = process.env.SPARES_PROBE_COOKIE ?? "";
const header = "x-spares-blob-read-bytes";

async function probe(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    headers: cookie ? { cookie } : {},
  });
  const bytes = Number(res.headers.get(header) ?? res.headers.get("X-Spares-Blob-Read-Bytes") ?? "NaN");
  return { path, status: res.status, bytes };
}

const paths = ["/api/machines", "/api/quotes", "/api/tickets"];

console.log(`Probing ${base} (cookie ${cookie ? "set" : "missing"})`);
for (const path of paths) {
  const first = await probe(path);
  const second = await probe(path);
  console.log(
    JSON.stringify({
      path,
      first,
      second,
      deltaBytes: second.bytes - first.bytes,
    }),
  );
}
