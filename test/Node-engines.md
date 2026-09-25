Node engines (>=18) disagree with the runtime check (>=20) and CI (20)
Repo Avatar
MettaChain/PropChain-BackEnd
Context
package.json engines.node: '>=18.0.0'; src/main.ts refuses to boot below Node 20; CI pins Node 20; README says Node >=18.

Problem
Users on Node 18/19 install fine (engines satisfied) and then hit a hard exit at boot with a confusing message. The contract is duplicated in three places with different values.

Proposed approach
Raise engines.node to >=20.0.0 (and npm already >=10), align README, and keep the runtime guard as a backstop with a single source of truth (a shared constant in package.json is not possible - so add a boot diagnostic as secondary).

Acceptance criteria
engines, README, runtime guard, and CI all require Node >=20.