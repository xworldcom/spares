"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Controlled input: keep a raw string while focused; parse/validate and commit on blur only.
 */
export function useBlurCommitField<T>(options: {
  value: T;
  format: (value: T) => string;
  parse: (raw: string) => { ok: true; value: T } | { ok: false; error: string };
  onCommit: (value: T) => void;
  onError?: (message: string | null) => void;
}) {
  const { value, format, parse, onCommit, onError } = options;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(null);
    }
  }, [value]);

  const displayValue = draft ?? format(value);

  const commit = useCallback(
    (raw: string) => {
      const parsed = parse(raw);
      if (!parsed.ok) {
        setError(parsed.error);
        onError?.(parsed.error);
        setDraft(null);
        return;
      }
      setError(null);
      onError?.(null);
      onCommit(parsed.value);
      setDraft(null);
    },
    [onCommit, onError, parse],
  );

  return {
    value: displayValue,
    error,
    onFocus: () => {
      focused.current = true;
      setDraft(format(value));
    },
    onChange: (raw: string) => {
      setDraft(raw);
      if (!raw.trim()) {
        setError(null);
        onError?.(null);
        return;
      }
      const parsed = parse(raw);
      if (!parsed.ok) {
        setError(parsed.error);
        onError?.(parsed.error);
      } else {
        setError(null);
        onError?.(null);
      }
    },
    onBlur: () => {
      focused.current = false;
      commit(draft ?? format(value));
    },
    clearDraft: () => setDraft(null),
  };
}
