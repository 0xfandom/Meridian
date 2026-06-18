/// A subscriber the hub can push messages to. Abstracted from the socket so the broadcast logic is
/// testable without real connections.
export interface Subscriber {
  send(data: string): void;
}

/// Fan-out hub for live updates. The runtime adds a subscriber per WebSocket connection and removes
/// it on close; the broadcaster pushes serialized updates to all current subscribers.
export class Hub {
  private readonly subscribers = new Set<Subscriber>();

  add(subscriber: Subscriber): void {
    this.subscribers.add(subscriber);
  }

  remove(subscriber: Subscriber): void {
    this.subscribers.delete(subscriber);
  }

  broadcast(data: string): void {
    for (const subscriber of this.subscribers) subscriber.send(data);
  }

  get size(): number {
    return this.subscribers.size;
  }
}
