import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GameState } from "@/types/domain";
import { initGameCore, createGameState, prefetchGameCore } from "@/wasm/moduleLoader";

type WasmModule = Awaited<ReturnType<typeof initGameCore>>;

export interface UseWasmOptions {
  maxRetries?: number;
  retryDelay?: number;
  onReady?: (module: WasmModule) => void;
}

export interface UseWasmResult {
  ready: boolean;
  loading: boolean;
  error: Error | null;
  module: WasmModule | null;
  reload: () => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("Failed to load WASM module");
}

export function useWasm(options: UseWasmOptions = {}): UseWasmResult {
  const { maxRetries = 2, retryDelay = 300, onReady } = options;
  const [module, setModule] = useState<WasmModule | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const attemptsRef = useRef(0);
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const currentLoadId = ++loadIdRef.current;
    attemptsRef.current = 0;
    let lastError: Error | null = null;

    while (attemptsRef.current <= maxRetries) {
      try {
        const wasm = await initGameCore();
        if (loadIdRef.current !== currentLoadId) {
          return;
        }
        setModule(wasm);
        onReady?.(wasm);
        setLoading(false);
        setError(null);
        return;
      } catch (err) {
        lastError = normalizeError(err);
        if (attemptsRef.current === maxRetries) {
          break;
        }
        await sleep(retryDelay * (attemptsRef.current + 1));
        attemptsRef.current += 1;
      }
    }

    if (loadIdRef.current === currentLoadId) {
      setLoading(false);
      setError(lastError);
      setModule(null);
    }
  }, [maxRetries, retryDelay, onReady]);

  useEffect(() => {
    prefetchGameCore();
    load();
    return () => {
      loadIdRef.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    load();
  }, [load]);

  return useMemo(
    () => ({
      ready: !!module,
      loading,
      error,
      module,
      reload,
    }),
    [module, loading, error, reload]
  );
}

export async function bootstrapGameState(): Promise<GameState> {
  return createGameState();
}
