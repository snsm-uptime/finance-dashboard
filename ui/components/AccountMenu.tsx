"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { fetchCards, type CardItem } from "@/app/cards/cardsClient";
import { DefaultImportListControl } from "@/app/cards/DefaultImportListControl";
import { MoonIcon, PencilIcon, SunIcon, SystemIcon, TrashIcon } from "@/app/icons";
import { fetchLists, type ListItem } from "@/app/lists/listsClient";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";
import { Avatar } from "@/components/Avatar";
import { SingleChipPicker, type ChipOption } from "@/components/ChipPicker";
import { useChromeHeader } from "@/components/ChromeBack";
import {
  clearPrefsCache,
  usePreferences,
} from "@/components/PreferencesProvider";
import { TriSwitch } from "@/components/TriSwitch";
import { accountCopy } from "@/lib/i18n/account";
import { encodeAvatarPhoto } from "@/lib/imageEncode";
import type { Locale, ThemePreference } from "@/lib/i18n/locale";
import listsStyles from "@/app/lists/lists.module.scss";

import styles from "./AccountMenu.module.scss";
import { Tooltip } from "./Tooltip";

export function AccountMenu() {
  // NOTE: SSR hydration mismatch — server renders with default theme; client may hydrate with different theme.
  // This can cause brief light→dark flicker on page load. Mitigation: ensure initial HTML theme matches system preference.
  const { locale, theme, setLanguage, setTheme, setDefaultOriginKind, ready, me, refresh } =
    usePreferences();
  const t = accountCopy(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [, setCardsRefreshToken] = useState(0);
  const [photoPending, setPhotoPending] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Account has no tab-bar entry of its own — it's reached only via the
  // avatar in the chrome leading slot on other pages, so this is the one
  // page where that slot goes back to Back instead of the avatar.
  useChromeHeader({
    onBack: () => router.back(),
    title: t.title,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchLists({
      errorGeneric: t.errorGeneric,
      errorInvalidName: t.errorGeneric,
      errorForbidden: t.errorForbidden,
      errorUnauthorized: t.errorUnauthorized,
    }).then((result) => {
      if (!cancelled && result.ok) setLists(result.lists);
    });
    return () => {
      cancelled = true;
    };
    // List membership is independent of locale; fetch once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchCards({
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
      errorInvalidLabel: t.errorGeneric,
      errorInvalidIban: t.errorGeneric,
      errorDuplicateIban: t.errorGeneric,
    }).then((result) => {
      if (!cancelled && result.ok) setCards(result.cards.filter((card) => !card.is_archived));
    });
    return () => {
      cancelled = true;
    };
    // Card roster is independent of locale; fetch once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLanguage(next: Locale) {
    setPending(true);
    setError(null);
    try {
      await setLanguage(next);
    } catch {
      setError(t.saveLanguageFailed);
    } finally {
      setPending(false);
    }
  }

  async function onTheme(next: ThemePreference) {
    setPending(true);
    setError(null);
    try {
      await setTheme(next);
    } catch {
      setError(t.saveThemeFailed);
    } finally {
      setPending(false);
    }
  }

  async function onDefaultOrigin(value: string) {
    setPending(true);
    setError(null);
    try {
      if (value === "cash" || value === "blank") {
        await setDefaultOriginKind(value);
      } else {
        await setDefaultOriginKind("card", value);
      }
    } catch {
      setError(t.saveDefaultOriginFailed);
    } finally {
      setPending(false);
    }
  }

  const defaultOriginOptions: ChipOption[] = [
    { value: "cash", label: t.defaultOriginCash },
    { value: "blank", label: t.defaultOriginBlank },
    ...cards.map((card) => ({ value: card.id, label: card.label })),
  ];
  const defaultOriginSelectedValue =
    me?.default_origin_kind === "card"
      ? (me?.default_origin_card_id ?? "blank")
      : (me?.default_origin_kind ?? "blank");

  async function savePhoto(photoBase64: string | null) {
    setPhotoPending(true);
    setPhotoError(null);
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ photo_base64: photoBase64 }),
      });
      if (!response.ok) {
        setPhotoError(t.photoError);
        return;
      }
      await refresh();
    } catch {
      setPhotoError(t.photoError);
    } finally {
      setPhotoPending(false);
    }
  }

  async function onPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let encoded: string;
    try {
      encoded = await encodeAvatarPhoto(file);
    } catch {
      setPhotoError(t.photoError);
      return;
    }
    await savePhoto(encoded);
  }

  async function onSignOut() {
    setSigningOut(true);
    clearPrefsCache();
    resetMembershipListsStore();
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      clearPrefsCache();
      resetMembershipListsStore();
      window.location.assign("/sign-in");
    }
  }

  async function onPasswordReset() {
    setSigningOut(true);
    clearPrefsCache();
    resetMembershipListsStore();
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      clearPrefsCache();
      resetMembershipListsStore();
      window.location.assign("/forgot-password");
    }
  }

  const controlsDisabled = pending || !ready || signingOut;

  const choiceButtonClass = `font-inherit text-[0.85rem] font-semibold py-[0.5rem] px-[0.85rem] rounded-[8px] border border-border bg-surface text-foreground cursor-pointer ${styles.choice}`;
  const choiceButtonActiveClass = `font-inherit text-[0.85rem] font-semibold py-[0.5rem] px-[0.85rem] rounded-[8px] border border-accent bg-accent text-on-accent cursor-pointer ${styles.choiceActive}`;
  const ghostClass = `font-inherit text-[0.9rem] font-semibold py-[0.55rem] px-[1rem] rounded-[8px] border-0 bg-transparent text-muted cursor-pointer ${styles.ghost}`;
  const signOutClass = `font-inherit text-[0.9rem] font-semibold py-[0.55rem] px-[1rem] rounded-[8px] border border-border bg-surface text-foreground cursor-pointer ${styles.signOut}`;
  const avatarActionClass =
    "absolute inline-flex items-center justify-center rounded-full border border-border bg-surface text-foreground cursor-pointer shadow-sm disabled:opacity-45 disabled:cursor-not-allowed";

  return (
    <main className={listsStyles.main} style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}>
      {!ready ? (
        <p className="text-muted text-[0.85rem]">{t.loading}</p>
      ) : null}

      <div className="flex items-center gap-5 pb-5 mb-6 border-b border-border">
        <div className="relative flex-shrink-0" style={{ width: "8rem", height: "8rem" }}>
          <Avatar
            alias={me?.alias ?? null}
            seed={me?.user_id ?? "account"}
            photoBase64={me?.photo_base64 ?? null}
            size="lg"
          />
          <label className={`${avatarActionClass} w-8 h-8 -bottom-2 -left-2`}>
            <Tooltip label={t.photoUpload}>
              <PencilIcon className="w-4 h-4" />
            </Tooltip>
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              disabled={controlsDisabled || photoPending}
              onChange={(e) => void onPhotoChange(e)}
            />
          </label>
          {me?.photo_base64 ? (
            <button
              type="button"
              className={`${avatarActionClass} w-8 h-8 -top-2 -right-2 text-owe`}
              disabled={controlsDisabled || photoPending}
              onClick={() => void savePhoto(null)}
            >
              <Tooltip label={t.photoRemove}>
                <TrashIcon className="w-4 h-4" />
              </Tooltip>
            </button>
          ) : null}
        </div>
        <div>
          <p className="m-0 text-[1.05rem] font-bold text-foreground">{me?.alias ?? me?.email ?? ""}</p>
          {me?.alias ? <p className="m-0 text-[0.8rem] text-muted">{me?.email}</p> : null}
          {photoError ? <p className="m-0 mt-1 text-owe text-[0.8rem]">{photoError}</p> : null}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
        <section aria-labelledby="account-language" className="flex flex-col gap-2">
          <h2 id="account-language" className="m-0 text-[0.7rem] font-semibold text-muted uppercase tracking-[0.04rem]">
            {t.language}
          </h2>
          {/* TODO: Add RTL-aware layout (dir attribute on parent or logical CSS properties) */}
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.language}>
            <button
              type="button"
              className={locale === "en" ? choiceButtonActiveClass : choiceButtonClass}
              aria-pressed={locale === "en"}
              disabled={controlsDisabled}
              onClick={() => void onLanguage("en")}
            >
              {t.en}
            </button>
            <button
              type="button"
              className={locale === "es" ? choiceButtonActiveClass : choiceButtonClass}
              aria-pressed={locale === "es"}
              disabled={controlsDisabled}
              onClick={() => void onLanguage("es")}
            >
              {t.es}
            </button>
          </div>
        </section>

        <section aria-labelledby="account-theme" className="flex flex-col gap-2">
          <h2 id="account-theme" className="m-0 text-[0.7rem] font-semibold text-muted uppercase tracking-[0.04rem]">
            {t.theme}
          </h2>
          <TriSwitch
            aria-label={t.theme}
            value={theme}
            disabled={controlsDisabled}
            onChange={(next) => void onTheme(next)}
            options={[
              { value: "light", label: t.light, icon: <SunIcon /> },
              { value: "system", label: t.system, icon: <SystemIcon /> },
              { value: "dark", label: t.dark, icon: <MoonIcon /> },
            ]}
          />
        </section>

        <section aria-labelledby="account-default-origin" className="flex flex-col gap-2">
          <h2 id="account-default-origin" className="m-0 text-[0.7rem] font-semibold text-muted uppercase tracking-[0.04rem]">
            {t.defaultOriginTitle}
          </h2>
          <SingleChipPicker
            options={defaultOriginOptions}
            selectedValue={defaultOriginSelectedValue}
            onSelect={(value) => void onDefaultOrigin(value)}
            ariaLabel={t.defaultOriginTitle}
            disabled={controlsDisabled}
          />
        </section>

        {lists.length > 0 ? (
          <section aria-labelledby="account-default-destination" className="flex flex-col gap-2">
            <DefaultImportListControl
              lists={lists}
              messages={{
                defaultListTitle: t.defaultListTitle,
                errorGeneric: t.errorGeneric,
                errorUnauthorized: t.errorUnauthorized,
                errorForbidden: t.errorForbidden,
              }}
              onChanged={() => {
                void refresh();
                setCardsRefreshToken((n) => n + 1);
              }}
            />
          </section>
        ) : null}
      </div>

      <section aria-labelledby="account-session" className="flex items-center justify-between gap-2 pt-5 border-t border-border">
        <button
          type="button"
          className={ghostClass}
          disabled={signingOut}
          onClick={() => void onPasswordReset()}
        >
          {t.passwordReset}
        </button>
        <button
          type="button"
          className={signOutClass}
          disabled={signingOut}
          onClick={() => void onSignOut()}
        >
          {signingOut ? t.signingOut : t.signOut}
        </button>
      </section>

      {error ? (
        <p className="text-owe text-[0.9rem] mt-4">{error}</p>
      ) : null}
    </main>
  );
}
