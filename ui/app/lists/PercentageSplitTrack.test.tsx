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

    // Each label now leads with an initials-circle Avatar (same first letter
    // as the alias), so assert the alias text is present rather than an
    // exact match — the avatar's own initial would otherwise double up.
    const labels = Array.from(container.querySelectorAll(".sliderLabel")).map(
      (el) => el.textContent,
    );
    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain("Bob");
    expect(labels[1]).toContain("Owner");
    expect(labels[2]).toContain("Alice");
  });
});
