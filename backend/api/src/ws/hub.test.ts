import { describe, expect, it } from "vitest";
import { Hub, type Subscriber } from "./hub.js";

function recorder(): Subscriber & { messages: string[] } {
  const messages: string[] = [];
  return { messages, send: (data: string) => messages.push(data) };
}

describe("Hub", () => {
  it("broadcasts to all current subscribers and stops after removal", () => {
    const hub = new Hub();
    const a = recorder();
    const b = recorder();
    hub.add(a);
    hub.add(b);
    expect(hub.size).toBe(2);

    hub.broadcast("first");
    hub.remove(b);
    hub.broadcast("second");

    expect(a.messages).toEqual(["first", "second"]);
    expect(b.messages).toEqual(["first"]);
    expect(hub.size).toBe(1);
  });
});
