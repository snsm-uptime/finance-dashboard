"""Bank statement adapters (emit CanonicalLine only — later stories).

ADAPTERS is the concrete proof of FR-31/FR-36 "new banks don't rewrite core
import": registering PromericaStubAdapter here (Story 4.5) required zero
edits to application/bank_adapters.py or domain/canonical_line.py.
"""

from __future__ import annotations

from application.bank_adapters import BankAdapter

from adapters.bank.bac_credit.adapter import BacCreditAdapter
from adapters.bank.promerica_stub import PromericaStubAdapter

ADAPTERS: list[BankAdapter] = [BacCreditAdapter(), PromericaStubAdapter()]
