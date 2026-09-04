---
description: Apply the Deriv API cross-cutting conventions and read schemas live whenever writing Deriv API code.
alwaysApply: true
---

# Deriv API conventions

When writing any Deriv API code, follow the cross-cutting conventions served by
the hosted MCP tool **`guide_api_conventions`**. It is the single home for the
shared rules that apply to every call (headers, auth, rate limits, the error
envelope, and request conventions) — read them from that tool rather than
restating them here or guessing them from memory.

For anything that varies per endpoint — whether a call needs auth, which scopes
it requires, its fields, and its request/response schemas — read it live from
the hosted MCP fact tools rather than hardcoding it:

- **`search_endpoints`** — locate the endpoint.
- **`get_schema`** / **`get_field`** — read its auth requirement, scopes, and
  field schemas from the live surface.
- **`validate_payload`** — check a request body against the live schema.
- **`get_example`** — get a worked request example.
