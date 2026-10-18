# Listing API refactor: search

`PropertiesService.searchProperties` was an 80-line method containing two
completely different strategies, the row annotation and the response shaping. It
has been split so that each concern can be read — and changed — on its own.

```
searchProperties(dto)              resolve where / page / limit / sort, then pick a strategy
├── hasTrustScoreFilter(dto)
├── searchByTrustScore(...)        fetch all, filter in memory, page in memory
└── searchByPaging(...)            skip/take + COUNT in one transaction
```

Shared pieces, each now named:

| Member | Responsibility |
| --- | --- |
| `hasTrustScoreFilter` | the one branch condition |
| `searchRelations` | the owner/neighborhood payload every row carries, defined once instead of twice |
| `annotateTrustScore` | attach `neighborhoodTrustScore` to each row |
| `matchesTrustScoreRange` | the trust-score bound predicate |
| `buildPage` | the `{ items, total, page, limit, totalPages }` shape, computed once |

## Why the split helps

The two strategies have opposite paging models. `searchByPaging` pushes
`skip`/`take` into the database; `searchByTrustScore` cannot, because the score
is derived from the neighborhood row rather than stored, so it fetches every
matching row and pages in memory. That asymmetry used to be invisible, buried in
the middle of one method — and it is exactly the kind of thing that gets
"optimised" by accident by someone adding a `take` to the wrong branch.

`searchRelations` is the other quiet win: the owner and neighborhood `include`
was duplicated verbatim in both branches, so a field added to one was easy to
forget in the other.

## Behaviour is unchanged

- `bedrooms`/`bathrooms` exact values still win over the ranges.
- The public search still returns only ACTIVE, non-deleted listings whatever
  `status` was passed.
- A row with no neighborhood still scores `null` and is still excluded whenever
  either trust-score bound is set.
- The trust-score branch still fetches without `skip`/`take`, and the ordinary
  branch still reads page and count in one `$transaction`.
- Paging defaults are unchanged: `page` 1, `limit` 20, `createdAt desc`.
