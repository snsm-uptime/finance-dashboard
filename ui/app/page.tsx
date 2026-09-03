import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { RedirectIfAuthenticated } from "@/components/RedirectIfAuthenticated";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { requireAlias } from "@/lib/alias";
import { resolveServerAuthenticatedLanding } from "@/lib/serverLanding";
import { fetchSession } from "@/lib/session";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await fetchSession();
  if (session) {
    const destination = await resolveServerAuthenticatedLanding();
    // First signed-in visit (verify-off) must claim an alias before list chrome.
    await requireAlias(destination);
    redirect(destination);
  }

  return (
    <main>
      <RedirectIfAuthenticated />

      <section className="relative overflow-hidden">
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 400"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
        >
          <path
            d="M0,260 C240,330 480,200 720,260 C960,320 1200,220 1440,280 L1440,340 C1200,270 960,370 720,310 C480,250 240,350 0,300 Z"
            className="fill-accent/[0.06]"
          />
          <path
            d="M0,300 C240,350 480,250 720,310 C960,370 1200,270 1440,340 C1200,396.67 960,283.33 720,330 C480,376.67 240,263.33 0,300 Z"
            className="fill-accent/10"
          />
        </svg>
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-20 text-center">
          <h1 className="m-0 text-[2.25rem] font-semibold leading-[1.15]">
            Finance Helper
          </h1>
          <p className="m-0 max-w-lg text-muted leading-[1.5]">
            This tool helps you share expenses with roommates and friends, keep
            budgets on track, and import bank statements instead of entering every
            transaction by hand.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton href="/signup">Create an account</PrimaryButton>
            <GhostButton href="/sign-in">Sign in</GhostButton>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl grid-cols-1 gap-6 px-6 py-14 sm:grid-cols-3">
        <FeatureCard
          icon={
            <path d="M4 6h16M4 6l2-2m-2 2 2 2M4 12h16M4 12l2-2m-2 2 2 2M4 18h16M4 18l2-2m-2 2 2 2" />
          }
          title="Lists, shared or solo"
          description="Track expenses on your own or split them with roommates and friends — everyone sees the same running balance."
        />
        <FeatureCard
          icon={
            <>
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M3 10h18" />
            </>
          }
          title="Cards"
          description="Register the cards you pay with and route imported transactions to the right list automatically."
        />
        <FeatureCard
          icon={
            <>
              <path d="M4 20V10M10 20V4M16 20v-7" />
            </>
          }
          title="Budgets"
          description="Set spending limits by category, assign transactions, and see progress at a glance before you overspend."
        />
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-14 text-center">
        <Link
          href="/docs"
          className="text-accent no-underline hover:underline"
        >
          Tutorials &amp; accessibility guide
        </Link>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-surface p-5">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 text-accent"
      >
        {icon}
      </svg>
      <h2 className="m-0 text-[1rem] font-semibold leading-[1.3]">{title}</h2>
      <p className="m-0 text-muted leading-[1.5]">{description}</p>
    </div>
  );
}
