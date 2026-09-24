"""Bank statement adapters (emit CanonicalLine only — later stories).

ADAPTERS is the concrete proof of FR-31/FR-36 "new banks don't rewrite core
import": registering an adapter here requires zero edits to
application/bank_adapters.py or domain/canonical_line.py.
Story 4.9.2 replaced the former PromericaStubAdapter (Story 4.5) with the
real PromericaAdapter.
"""

from __future__ import annotations

from application.bank_adapters import BankAdapter

from adapters.bank.bac_credit.adapter import BacCreditAdapter
from adapters.bank.bac_debit.adapter import BacDebitAdapter
from adapters.bank.promerica.adapter import PromericaAdapter

ADAPTERS: list[BankAdapter] = [BacCreditAdapter(), BacDebitAdapter(), PromericaAdapter()]
