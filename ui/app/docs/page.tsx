import type { ReactNode } from "react";

export default function Docs() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="m-0 text-[1.75rem] font-semibold leading-[1.2]">
        Tutorials &amp; guides
      </h1>
      <p className="mt-2 text-muted leading-[1.5]">
        Quick references for the main things you can do in Finance Helper.
      </p>

      <div className="mt-8 flex flex-col gap-10">
        <DocSection title="Lists">
          <DocEntry title="Creating a list">
            Start a list to track expenses on your own or with others. Every
            member sees the same running balance.
          </DocEntry>
          <DocEntry title="Inviting people to a shared list">
            Invite roommates or friends to a list so expenses and balances
            stay in sync for everyone on it.
          </DocEntry>
          <DocEntry title="Splitting an expense">
            When you add a shared expense, the cost is split evenly across
            the list&apos;s members. If the total doesn&apos;t divide evenly,
            the leftover cent goes to whoever created the list.
          </DocEntry>
          <DocEntry title="Settling up">
            See computed shares for a shared list so you know who owes whom,
            without recording a separate payment ledger.
          </DocEntry>
        </DocSection>

        <DocSection title="Cards & imports">
          <DocEntry title="Registering a card">
            Register the cards you pay with so imported transactions can be
            routed to the right list automatically.
          </DocEntry>
          <DocEntry title="Uploading a bank statement">
            Upload a bank statement PDF instead of entering every transaction
            by hand.
          </DocEntry>
          <DocEntry title="Reviewing imported transactions">
            Review each imported transaction one at a time — assign it to a
            list, assign it to your default list, or delete it. You can undo
            your last action if you make a mistake.
          </DocEntry>
        </DocSection>

        <DocSection title="Budgets">
          <DocEntry title="Creating a budget">
            Set a spending limit for a category so you know when
            you&apos;re getting close to overspending.
          </DocEntry>
          <DocEntry title="Attributing transactions to a budget">
            Assign transactions to a budget&apos;s category so they count
            toward its progress.
          </DocEntry>
          <DocEntry title="Reading budget progress">
            Each budget shows a progress bar so you can see at a glance how
            much of the limit you&apos;ve used.
          </DocEntry>
        </DocSection>
      </div>
    </main>
  );
}

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="m-0 text-[1.15rem] font-semibold leading-[1.3]">{title}</h2>
      {children}
    </section>
  );
}

function DocEntry({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="m-0 text-[0.95rem] font-semibold leading-[1.3]">{title}</h3>
      <p className="mt-1 text-muted leading-[1.5]">{children}</p>
    </div>
  );
}
