import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Docs from "./page";

describe("Docs page", () => {
  it("renders tutorial group headings with at least one entry each", () => {
    const markup = renderToStaticMarkup(<Docs />);

    expect(markup).toMatch(/Lists/);
    expect(markup).toMatch(/Budgets/);
    expect(markup).toMatch(/Import/);

    expect(markup).toContain('href="#lists-create"');
    expect(markup).toContain('href="#budgets-create"');
    expect(markup).toContain('href="#import-upload"');
  });

  it("renders the UX-features section with accessibility/keyboard copy", () => {
    const markup = renderToStaticMarkup(<Docs />);

    expect(markup).toMatch(/Accessibility.*keyboard navigation/);
    expect(markup).toMatch(/keyboard/i);
    expect(markup).toMatch(/undo/i);
  });
});
