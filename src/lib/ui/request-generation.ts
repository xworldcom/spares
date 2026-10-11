import { useCallback, useRef } from "react";

/**
 * Ignore stale promise results after effect cleanup or a newer load started,
 * while still clearing loading state for the latest generation.
 */
export function useRequestGeneration() {
  const generationRef = useRef(0);

  const begin = useCallback(() => {
    generationRef.current += 1;
    return generationRef.current;
  }, []);

  const isCurrent = useCallback((generation: number) => {
    return generation === generationRef.current;
  }, []);

  return { begin, isCurrent };
}
