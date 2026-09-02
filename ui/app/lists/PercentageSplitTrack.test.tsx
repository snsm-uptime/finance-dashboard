/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PercentageSplitTrack } from "./PercentageSplitTrack";

vi.mock("./PercentageSplitTrack.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

describe("PercentageSplitTrack", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the current user as the leftmost label", async () => {
    await act(async () => {
      root.render(
        <PercentageSplitTrack
          userIds={["owner", "alice", "bob"]}
          currentUserId="bob"
          members={[
            { user_id: "owner", alias: "Owner" },
            { user_id: "alice", alias: "Alice" },
            { user_id: "bob", alias: "Bob" },
          ]}
          percents={{ owner: "40", alice: "35", bob: "25" }}
          onChangePercents={() => {}}
        />,
      );
    });

    // Each label is an Avatar only (no visible alias text) — the alias
    // still surfaces as the avatar's native hover tooltip/aria-label.
    const labels = Array.from(container.querySelectorAll(".sliderLabel")).map(
      (el) => el.querySelector("[title]")?.getAttribute("title"),
    );
    expect(labels).toHaveLength(3);
    expect(labels[0]).toBe("Bob");
    expect(labels[1]).toBe("Owner");
    expect(labels[2]).toBe("Alice");
  });
});
