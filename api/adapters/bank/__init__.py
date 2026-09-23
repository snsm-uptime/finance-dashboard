"""Bank statement adapters (emit CanonicalLine only — later stories).

ADAPTERS is the concrete proof of FR-31/FR-36 "new banks don't rewrite core
import": registering PromericaStubAdapter here (Story 4.5) required zero
edits to application/bank_adapters.py or domain/canonical_line.py.
Story 4.9.2 replaces the stub with the real PromericaAdapter, with the same
zero-edits-elsewhere property.
"""

from __future__ import annotations

from application.bank_adapters import BankAdapter

from adapters.bank.bac_credit.adapter import BacCreditAdapter
from adapters.bank.promerica.adapter import PromericaAdapter

ADAPTERS: list[BankAdapter] = [BacCreditAdapter(), PromericaAdapter()]
