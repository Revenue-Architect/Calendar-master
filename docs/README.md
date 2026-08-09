# Planner Documentation

This directory is the source of truth for product and architecture decisions that
are too detailed for the repository README.

## Product specifications

- [`product/planner-foundation.md`](product/planner-foundation.md) is the living,
  three-level capability specification for Calendar, Tasks, Notes, and the shared
  planner platform. Approved domains are appended incrementally.

## Architecture decisions

- [`adr/0001-domain-oriented-modular-monolith.md`](adr/0001-domain-oriented-modular-monolith.md)
  records the decision to replace the single-component architecture with a
  domain-oriented modular monolith.

## Documentation rules

- Product behavior is specified independently from frontend presentation.
- Level 1 describes a product capability, Level 2 a sub-capability, and Level 3
  the required behavior and important edge cases.
- `MUST`, `SHOULD`, and `MAY` use their normal requirements meanings.
- Approved behavior is changed by editing the specification and recording the
  reason in its decision log.
- Provider-specific Google and Microsoft behavior belongs in future integration
  specifications, not in the canonical product domains.
