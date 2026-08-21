import { useEffect, useState } from "react";
import {
  CardIdentificationMessages,
  identifyCardForStatement,
  type StagedStatement,
} from "@/app/upload/uploadClient";

/**
 * Card identification for individual review (Story 4.8.1, AC #2/#3).
 * Automatically matches IBAN to existing card or prompts registration.
 */
export function useCardIdentification(
  sessionId: string,
  statement: StagedStatement | null,
  messages: CardIdentificationMessages,
) {
  const [cardMatched, setCardMatched] = useState(false);
  const [cardId, setCardId] = useState<string | undefined>();
  const [cardLabel, setCardLabel] = useState<string | undefined>();
  const [iban, setIban] = useState<string | null | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);

  // A statement is identifiable only while it is staged and carries an IBAN.
  // When it is not, the hook reports the empty result below rather than
  // resetting state from inside the effect (react-hooks/set-state-in-effect).
  const identifiable = Boolean(statement?.iban && statement.status === "staged");

  // Auto-identify card when statement changes
  useEffect(() => {
    if (!identifiable) return;

    let cancelled = false;

    async function identify() {
      if (!statement) return;
      setLoading(true);
      setError(null);
      setNeedsRegistration(false);
      const result = await identifyCardForStatement(
        sessionId,
        statement.id,
        undefined, // No label on initial identification
        messages,
      );

      if (cancelled) return;
      setLoading(false);

      if (!result.ok) {
        setError(result.error);
        setCardMatched(false);
        setCardId(undefined);
        setCardLabel(undefined);
        setIban(result.error.includes("unauthorized") ? undefined : statement?.iban || null);
        setNeedsRegistration(true);
        return;
      }

      setIban(result.iban || statement?.iban || null);
      if (result.matched) {
        setCardMatched(true);
        setCardId(result.cardId);
        setCardLabel(result.cardLabel);
        setNeedsRegistration(false);
      } else {
        setCardMatched(false);
        setCardId(undefined);
        setCardLabel(undefined);
        setNeedsRegistration(true);
      }
    }

    identify();
    return () => {
      cancelled = true;
    };
  }, [sessionId, statement, identifiable, messages]);

  // Register new card and re-identify
  async function registerCard(label: string): Promise<{ ok: boolean; error?: string }> {
    if (!statement || !iban) return { ok: false, error: messages.errorGeneric };

    setLoading(true);
    setError(null);

    const result = await identifyCardForStatement(sessionId, statement.id, label, messages);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return { ok: false, error: result.error };
    }

    setIban(result.iban || iban);
    setCardMatched(result.matched);
    setCardId(result.cardId);
    setCardLabel(result.cardLabel);
    setNeedsRegistration(!result.matched);
    return { ok: result.matched };
  }

  if (!identifiable) {
    return {
      cardMatched: false,
      cardId: undefined,
      cardLabel: undefined,
      iban: undefined,
      loading: false,
      error: null,
      needsRegistration: false,
      registerCard,
    };
  }

  return {
    cardMatched,
    cardId,
    cardLabel,
    iban,
    loading,
    error,
    needsRegistration,
    registerCard,
  };
}
