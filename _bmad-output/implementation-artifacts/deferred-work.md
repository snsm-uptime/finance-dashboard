- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Real statement PDFs remain reachable in git history despite untracking `bank_data/`
  evidence: Review noted prior commits still contain `bank_data/*.pdf` blobs; history rewrite was Ask First / out of this story

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Pin Compose/base image digests for reproducible rebuilds
  evidence: Floating `postgres:16` / `python:3.12-slim` / `node:20-bookworm-slim` tags can drift silently

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-scaffold-compose-app-with-health-checks.md`
  summary: Harden docker-compose.prod.yml (secret assertions, docs off, bind localhost)
  evidence: Prod overlay currently only adds restart policies and NODE_ENV/ENVIRONMENT labels
