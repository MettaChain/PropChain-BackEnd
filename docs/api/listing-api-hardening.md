# Listing API hardening

`GET /properties/search` (`SearchPropertiesDto`):

- `sortBy` must be one of `PROPERTY_SORT_FIELDS`, so arbitrary column names cannot reach the query.
- Free-text filters (`city`, `state`, `zipCode`, `country`, `location`, `propertyType`, `category`, `tag`, `amenityType`) are capped at 100 characters.
