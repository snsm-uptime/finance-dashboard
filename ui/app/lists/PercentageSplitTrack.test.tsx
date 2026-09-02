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

  it("sizes each label to match its segment's width for uneven splits", async () => {
    await act(async () => {
      root.render(
        <PercentageSplitTrack
          userIds={["owner", "alice", "bob"]}
          currentUserId="owner"
          members={[
            { user_id: "owner", alias: "Owner" },
            { user_id: "alice", alias: "Alice" },
            { user_id: "bob", alias: "Bob" },
          ]}
          percents={{ owner: "60", alice: "25", bob: "15" }}
          onChangePercents={() => {}}
        />,
      );
    });

    const segments = Array.from(container.querySelectorAll(".sliderSegment")) as HTMLElement[];
    const labels = Array.from(container.querySelectorAll(".sliderLabel")) as HTMLElement[];
    expect(segments).toHaveLength(3);
    expect(labels).toHaveLength(3);
    segments.forEach((segment, i) => {
      expect(labels[i].style.width).toBe(segment.style.width);
    });
  });

  it("renders a muted reference bar where percent differs from the default (AC #2)", async () => {
    await act(async () => {
      root.render(
        <PercentageSplitTrack
          userIds={["owner", "alice", "bob"]}
          currentUserId="owner"
          members={[
            { user_id: "owner", alias: "Owner" },
            { user_id: "alice", alias: "Alice" },
            { user_id: "bob", alias: "Bob" },
          ]}
          percents={{ owner: "60", alice: "25", bob: "15" }}
          defaultPercents={{ owner: "40", alice: "30", bob: "30" }}
          onChangePercents={() => {}}
        />,
      );
    });

    const bars = Array.from(
      container.querySelectorAll("[data-default-bar]"),
    ) as HTMLElement[];
    expect(bars).toHaveLength(3);
    // owner: cumulative default = 40 -> left: 40%
    expect(bars.find((b) => b.getAttribute("data-default-bar") === "owner")?.style.left).toBe(
      "40%",
    );
    // alice: cumulative default = 40 + 30 = 70 -> left: 70%
    expect(bars.find((b) => b.getAttribute("data-default-bar") === "alice")?.style.left).toBe(
      "70%",
    );
    // bob: cumulative default = 40 + 30 + 30 = 100 -> left: 100%
    expect(bars.find((b) => b.getAttribute("data-default-bar") === "bob")?.style.left).toBe(
      "100%",
    );
  });

  it("renders no reference bar when percents equal the default (AC #3)", async () => {
    await act(async () => {
      root.render(
        <PercentageSplitTrack
          userIds={["owner", "alice", "bob"]}
          currentUserId="owner"
          members={[
            { user_id: "owner", alias: "Owner" },
            { user_id: "alice", alias: "Alice" },
            { user_id: "bob", alias: "Bob" },
          ]}
          percents={{ owner: "40", alice: "30", bob: "30" }}
          defaultPercents={{ owner: "40", alice: "30", bob: "30" }}
          onChangePercents={() => {}}
        />,
      );
    });

    const bars = container.querySelectorAll("[data-default-bar]");
    expect(bars).toHaveLength(0);
  });
});
