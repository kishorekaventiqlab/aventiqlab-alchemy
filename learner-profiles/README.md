# Learner Profiles

Five bands, each a file conforming to [`/schemas/learner-profile.schema.json`](../schemas/learner-profile.schema.json): [3yr](3yr/), [5yr](5yr/), [7yr](7yr/), [10yr](10yr/), [staff-principal](staff-principal/).

Years of experience is not treated as a proficiency measure. What actually differentiates a profile is its `build_expectations`, `operational_expectations`, `troubleshooting_expectations`, `architecture_expectations`, and `proof_expectations` — each a set of `{statement, verbs, capability_refs}` entries. Two engineers with the same years of experience can have very different profiles if their expectation fields differ; the band is a convenience label, not the source of truth.

Notice, in particular, `lp-staff-principal-...`'s `build_expectations` uses `verbs: [DESIGN, BUILD]` together rather than `[BUILD]` alone like `lp-3yr-...` — expectation *shape*, not just proficiency level, changes across bands.

`prerequisites` chains each profile to the one below it (`staff-principal` → `10yr` → `7yr` → `5yr` → `3yr`), and every `capability_refs` entry points only at capabilities actually authored in `/capability-map/`.
