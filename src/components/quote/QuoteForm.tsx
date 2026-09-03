"use client";

import { useState } from "react";
import { createQuote } from "@/lib/api/quotes";
import { errorMessage } from "@/lib/api/errors";
import type { Part } from "@/lib/api/types";

export function QuoteForm({
  machineId,
  part,
}: {
  machineId: string;
  part: Part | null;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessId(null);
    if (!part) {
      setError("Select a named part before requesting a quote.");
      return;
    }
    setSubmitting(true);
    try {
      const quote = await createQuote({
        machineId,
        partIds: [part.id],
        note: note.trim() || undefined,
      });
      setSuccessId(quote.id);
      setNote("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not request a quote."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-3 rounded-lg border border-neutral-200 bg-white px-4 py-4"
    >
      <h2 className="text-sm font-semibold text-neutral-900">Request quote</h2>
      <p className="text-sm text-neutral-600">
        Sends the selected part number to staff. There is no cart or checkout.
      </p>
      <div>
        <label htmlFor="quote-note" className="block text-sm font-medium text-neutral-800">
          Note (optional)
        </label>
        <textarea
          id="quote-note"
          name="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          placeholder="Need-by date, site, or serial…"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {successId ? (
        <p className="text-sm text-green-800" role="status">
          Quote requested ({successId}).
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting || !part}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Request quote"}
      </button>
    </form>
  );
}
