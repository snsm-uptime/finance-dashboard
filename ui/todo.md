I have the following ideas / refactors / features,
your goal is to consider which could be developed in parallel,
think about this so the PRs created are not as conflicted between
each other when parallel working.

1. For the ./app/lists/PercentageSplitTrack.tsx I want the avatar to be centered relative to the width of the div corresponding to them, also leave a muted bar at the original location when the user sets a custom percentage for reference.
2. The budgets should have a progress-bar at the bottom of the ./app/budgets/BudgetsPanel.tsx instead of the colored circle. keep the style behavior to color the progress-bar.
  2.1 On hover, the progress-bar component must show a tooltip with the details (current/total)
  2.2 In the ./app/budgets/[budgetId]/page.tsx use the progress bar too. The numbers are contained in a card that has the progress bar at the bottom.
    2.2.1 the list chips should show below the card
3. Budgets must have a period range (from date 2026/01/01 to 2026/03/01 for example) let's discuss the creation of a date range picker, this must be included in the update form.
  3.1 only assign transactions from the date period
  3.2 if the period changes, remove transactions that are out of bounds
4. add an option to archive budgets, lists and cards
  4.1 add a box icon on the opposite end of the page title that when clicked, shows the corresponding list with the filter to show only archived items, this turns the icon ON, like a toggle. it should morph into an open box, when clicked again, morphs back to the closed box and shows not archived items.
  4.2 when the toggle is ON, if the user moves to a different screen, it turns back off. 
  4.3 when the archive is showing, the create inputs are hidden.
5. Add upload support for statements from:
  - Promerica Credit
  - BAC Debit
