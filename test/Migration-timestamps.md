Migration timestamps collide: ordering is ambiguous for deploy
Repo Avatar
MettaChain/PropChain-BackEnd
Context
prisma/migrations/ contains colliding prefixes: 20260422000001_add_google_oauth and 20260422000001_add_user_preferences...; three 20260429000000_*; three 20260527000000_*.

Problem
Prisma determines apply-order lexicographically. Equal timestamps make ordering depend on the full folder name, which can shuffle add_google_oauth vs add_user_preferences relative intent (and the raw .sql files above make it worse). Races produce 'table already exists' failures during deploy and non-reproducible fresh-setup behavior.

Proposed approach
Renumber migrations with unique, strictly increasing timestamps in commit order; add a CI lint (extend scripts/validate-migrations.ts) that fails on duplicate prefixes or out-of-order planting.

Acceptance criteria
Every migration folder has a unique timestamp; deploy order is deterministic.