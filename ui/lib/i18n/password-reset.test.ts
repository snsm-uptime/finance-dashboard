import { describe, expect, it } from "vitest";

import { passwordResetMessages } from "./password-reset";

describe("password-reset i18n", () => {
  it("has matching EN/ES keys", () => {
    expect(Object.keys(passwordResetMessages.en).sort()).toEqual(
      Object.keys(passwordResetMessages.es).sort(),
    );
  });

  it("mentions SMTP failure guidance in both locales", () => {
    expect(passwordResetMessages.en.forgotErrorSmtp.toLowerCase()).toContain(
      "smtp",
    );
    expect(passwordResetMessages.es.forgotErrorSmtp.toLowerCase()).toContain(
      "smtp",
    );
  });
});
