export type EventMap = Record<string, unknown>;

export interface EventBusOptions {
  name?: string;
  historyLimit?: number;
  debug?: boolean;
}

export interface EventBusEntry<TEvents extends EventMap, TKey extends keyof TEvents = keyof TEvents> {
  id: number;
  event: TKey;
  payload: TEvents[TKey];
  timestamp: number;
}

type Listener<T> = (payload: T) => void;
type AnyListener<TEvents extends EventMap> = <TKey extends keyof TEvents>(
  event: TKey,
  payload: TEvents[TKey],
  entry: EventBusEntry<TEvents, TKey>
) => void;

export class EventBus<TEvents extends EventMap> {
  private readonly options: Required<EventBusOptions>;
  private readonly listeners = new Map<keyof TEvents, Set<Listener<any>>>();
  private readonly anyListeners = new Set<AnyListener<TEvents>>();
  private history: Array<EventBusEntry<TEvents>> = [];
  private sequence = 0;

  constructor(options: EventBusOptions = {}) {
    const { historyLimit = 200, debug = false, name = "EventBus" } = options;
    this.options = { historyLimit, debug, name };
  }

  public on<TKey extends keyof TEvents>(event: TKey, listener: Listener<TEvents[TKey]>) {
    const set = this.listeners.get(event) ?? new Set<Listener<TEvents[TKey]>>();
    set.add(listener);
    this.listeners.set(event, set);
    return () => this.off(event, listener);
  }

  public once<TKey extends keyof TEvents>(event: TKey, listener: Listener<TEvents[TKey]>) {
    const wrapper: Listener<TEvents[TKey]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  public off<TKey extends keyof TEvents>(event: TKey, listener: Listener<TEvents[TKey]>) {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    set.delete(listener as Listener<any>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  public onAny(listener: AnyListener<TEvents>) {
    this.anyListeners.add(listener);
    return () => {
      this.anyListeners.delete(listener);
    };
  }

  public emit<TKey extends keyof TEvents>(event: TKey, payload: TEvents[TKey]) {
    const entry = this.pushHistory(event, payload);
    if (this.options.debug) {
      this.logDebug(event as string, payload);
    }

    const set = this.listeners.get(event);
    if (set) {
      for (const listener of Array.from(set)) {
        listener(payload);
      }
    }

    if (this.anyListeners.size > 0) {
      for (const listener of Array.from(this.anyListeners)) {
        listener(event, payload, entry as EventBusEntry<TEvents, typeof event>);
      }
    }

    return entry;
  }

  public clearListeners() {
    this.listeners.clear();
    this.anyListeners.clear();
  }

  public getHistory(limit = this.options.historyLimit): Array<EventBusEntry<TEvents>> {
    if (limit >= this.history.length) {
      return [...this.history];
    }
    return this.history.slice(this.history.length - limit);
  }

  public clearHistory() {
    this.history = [];
  }

  public listenerCount(event?: keyof TEvents) {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total + this.anyListeners.size;
  }

  public getHistoryLimit() {
    return this.options.historyLimit;
  }

  public setHistoryLimit(limit: number) {
    this.options.historyLimit = Math.max(0, limit);
    if (this.history.length > limit) {
      this.history = this.history.slice(this.history.length - limit);
    }
  }

  public getName() {
    return this.options.name;
  }

  private pushHistory<TKey extends keyof TEvents>(event: TKey, payload: TEvents[TKey]) {
    const entry: EventBusEntry<TEvents, TKey> = {
      id: ++this.sequence,
      event,
      payload,
      timestamp: Date.now(),
    };
    if (this.options.historyLimit > 0) {
      this.history.push(entry as EventBusEntry<TEvents>);
      if (this.history.length > this.options.historyLimit) {
        this.history.shift();
      }
    }
    return entry;
  }

  private logDebug(event: string, payload: unknown) {
    if (typeof console !== "undefined" && console.debug) {
      console.debug(`[${this.options.name}] ${event}`, payload);
    }
  }
}
