# Recent works signing boundary

Read-only review found `generation_jobs` rows cannot by themselves prove that a
caller owns each object named in their fields. The original migration granted
owner INSERT/UPDATE; a later migration dropped those policies. Live read-only
inspection found RLS enabled and only owner SELECT/DELETE policies. It also
found table-level client privileges including TRUNCATE: that is a separate
operational concern requiring its own review. No production exploitation was
attempted.

There is also a potential source-code trust chain independent of direct table
writes. The progress endpoint accepts a client-chosen URL in an owner-scoped
row, and its `mayFileUrl` validates signed-form own-storage URLs but accepts a
public-form own-storage URL. `callerMedia.recordedForCaller` considers an
owner row with the same bucket/path as evidence, including a public-form URL.
The latter could make a later signed-form URL eligible for signing despite the
first row not proving access. This is a code-level finding; reachability and
impact must be validated safely outside production. The shared Library and
editor behavior is outside this MCP patch and still requires separate review.

For MCP, service-role signing now requires an actual owner-prefixed upload
object. Other signed storage assets are returned only if storage currently
accepts their existing URL; the endpoint does not renew that grant. It never
trusts source or storage_verified metadata as authorization. Consequently,
legitimate generated assets whose links have expired and whose object paths
are not user-prefixed will be omitted until there is trustworthy server-only
asset provenance or a user-scoped storage authorization. This fail-closed
limitation is intentional and prevents reviving access based on expired bearer
tokens or client-influenced rows.

`lib/mcp/gemini/works.test.ts` tests a user-owned upload, a currently valid
generated link, forged and expired links with trusted-looking metadata,
another user's path, an object mismatch, and failed signing. It uses mocks;
it is not a live storage or production test.
