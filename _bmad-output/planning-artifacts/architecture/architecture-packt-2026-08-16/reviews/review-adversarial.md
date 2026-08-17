# Adversarial Review — packt-storage-adapter architecture spine

**Target:** `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/ARCHITECTURE-SPINE.md`
**Method:** For each AD, construct two independent, spec-compliant implementers and find where their outputs disagree at the seam. Grounded against the actual current codebase (`src/lib/upload-policy.ts`, `src/db/index.ts`, `document-upload-actions.ts`, `reservation-document-actions.ts`, `cover-upload-actions.ts`, `trips/actions.ts`, `trips/[tripId]/actions.ts`, `reservations/actions.ts`).

## Verdict

The spine names the right seams (port, proxy route, resolver, singleton) but under-specifies the contracts *at* those seams enough that two spec-compliant builds will not interoperate — the interface types are too loose (`ReadableStream`, bare `del(url)`), two ADs (AD-4 and AD-8) actively conflict on one code path, and the resolver in AD-6 has no pinned signature despite being the exact thing AD-6 exists to make singular.

---

## Finding 1 — AD-4 and AD-8 directly conflict on `del()` permission errors [HIGH]

**ADs:** AD-4, AD-8. Both bind `local-filesystem-adapter.ts`.

- AD-4: "`del(url)` is best-effort against the current adapter only (matches the existing swallow-and-warn cleanup pattern already in the codebase)."
- AD-8: "`EACCES`/`EPERM` errors from filesystem writes are caught and re-thrown with an explicit message... Never swallowed, never generic-wrapped."

A PUID/PGID bind-mount mismatch (the exact failure mode AD-8 exists to catch) can deny the *unlink* just as easily as it denies a write — deleting an entry requires write permission on its containing directory. So the two rules govern the same failure on the same file.

**Concrete scenario:** Engineer A wires `removeReservationDocument`'s cleanup call (today: `reservation-document-actions.ts:74-81`, a `try { await del(doc.url) } catch { /* orphan tolerable */ }`) against AD-4's "best-effort/swallow-and-warn" framing and assumes `adapter.del()` never rejects for expected failure modes. Engineer B writes `local-filesystem-adapter.ts` reading AD-8 literally ("never swallowed... local-filesystem-adapter.ts"), and has `del()`'s internal `fs.unlink` re-throw a loud, explicit PUID/PGID error on `EACCES` — because AD-8's binds line names the whole adapter file, and its rule text about "filesystem writes" is exactly what `del()` does at the syscall level. Both are individually correct against the AD they were reading. Wired together: a real bind-mount ownership problem now throws out of `del()`, uncaught by call sites that were written assuming AD-4's swallow guarantee, turning what should be a silent orphan-and-warn into a 500 on the delete-document action.

**Fix:** Pick one owner for permission-error handling on `del()` specifically — either carve out an explicit exception in AD-8 ("does not apply to `del()`'s best-effort path") or amend AD-4 to say del() surfaces permission errors and call sites must catch them (contradicting "matches the existing swallow-and-warn pattern," since today's del() calls (`trips/actions.ts:622`, `trips/[tripId]/actions.ts:210-239`, `reservations/actions.ts:210`) swallow indiscriminately).

---

## Finding 2 — `read(): Promise<ReadableStream>` doesn't pin which stream type, and the two obvious choices don't interoperate [HIGH]

**AD:** AD-1.

The interface says `read(key: string): Promise<ReadableStream>`. `ReadableStream` is ambiguous in a Node/Next.js codebase:

- The Web Streams `ReadableStream` (lib.dom global) — what `new Response(stream)` in a route handler needs as `BodyInit`.
- `node:fs`'s `fs.createReadStream()` return type, `fs.ReadStream`, which extends Node's `stream.Readable` — **not** structurally assignable to the Web `ReadableStream` interface.

`local-filesystem-adapter.ts` is naturally built on `node:fs/promises` (per the Stack table — "already used by `local-upload.ts` today"), so its most natural `read()` implementation is `fs.createReadStream(path)`, a Node `Readable`. The proxy route (`api/storage/[...path]/route.ts`) most naturally does `return new Response(stream)`, which needs a Web `ReadableStream`. Nothing in AD-1 says the adapter must call `Readable.toWeb()` before returning, and nothing in AD-5 says the route must convert on the way in. Two spec-compliant builders — adapter author uses `fs.createReadStream` untouched; route author writes `new Response(await adapter.read(key))` trusting the declared `Promise<ReadableStream>` type — get a TypeScript error at best, or a runtime body-type mismatch at worst, depending on how loosely each side typed the boundary (e.g., an `as unknown as ReadableStream` cast on the adapter side hides the compile error and pushes the break to runtime).

**Fix:** Pin the exact type in the interface (`ReadableStream<Uint8Array>` from `node:stream/web`, explicitly) and state which side is responsible for the Node→Web conversion, since the Stack table's `node:fs/promises` choice guarantees this seam will be hit by whoever builds the local adapter.

---

## Finding 3 — `resolveOwningTripId(scope, ownerId)` has no pinned signature, vocabulary, or not-found behavior [HIGH]

**AD:** AD-6.

AD-6 states only the *purpose* ("maps a storage scope + ownerId to a tripId") and names the call sites that must share it. Two concrete gaps:

**(a) Vocabulary mismatch between the two call sites.** Write-side actions call `createUploadStorageName(scope, ownerId, mimeType)` with the *singular* `UploadScope` literal (`"event-document"`, `"reservation-document"`, ...) — that's the type already defined in `upload-policy.ts:46`. The proxy route, by contrast, only has the raw URL path to work with: `/api/storage/event-documents/{eventId}/{uuid}.jpg`, where the first segment is the *plural* prefix from `UPLOAD_SCOPE_PREFIXES` (`"event-documents"`, with the trailing "s" — `upload-policy.ts:48-53`). There is no declared inverse of `UPLOAD_SCOPE_PREFIXES` anywhere in the spine or the current codebase (only the forward `scope → prefix` map exists). So: does `resolveOwningTripId`'s `scope` parameter take the singular `UploadScope` type (matching the write side, forcing the route author to invent an unowned prefix→scope reverse-map) or the plural URL-prefix string (matching the route, meaning the write-side action author's natural call `resolveOwningTripId("event-document", eventId)` silently mismatches a resolver keyed on `"event-documents"`)? AD-2 declares key-naming "exclusively" owned by `createUploadStorageName()` but assigns no owner to its parse-back-apart mirror image — a real gap, not a stylistic one, since AD-6 assumes that split has already happened before its function is called.

**(b) Not-found behavior.** The functions AD-6 is meant to replace throw on not-found today (`getEventTripId`, `document-upload-actions.ts:13-17`: `if (!event) throw new Error("Event not found")`; `getReservationTripId`, `reservation-document-actions.ts:13-20`, same shape). A route author, needing to turn a bad/tampered path segment into a clean `404` rather than an unhandled exception, has a real incentive to make the shared resolver return `Promise<string | null>` instead. If they do (reasonably, since AD-6 doesn't say otherwise), every existing write-side call site that migrates to the shared resolver and does `const tripId = await resolveOwningTripId(...)` without a null check now silently proceeds with `tripId = null` into `assertTripAccess(null, user.id!, "editor")` — an auth-adjacent bug, not just a UX one.

**Fix:** Pin the exact signature in the AD text: parameter type for `scope` (singular `UploadScope`, not a prefix string), and explicit return type (`Promise<string>`, throws `Error` on not-found — matching today's convention — or `Promise<string | null>`, pick one). Assign ownership of the key-parsing step (raw key string → `{scope, ownerId}`) explicitly, ideally as an exported `parseUploadStorageName()` sibling to `createUploadStorageName()` in `upload-policy.ts`, not something the route re-derives.

---

## Finding 4 — Proxy route URL shape doesn't specify whether the key is embedded raw or encoded, and the two choices break the catch-all round trip [MEDIUM-HIGH]

**ADs:** AD-3, AD-5, structural seed (`[...path]/route.ts`).

Storage keys contain real `/` characters by construction (`{scope-prefix}/{ownerId}/{uuid}.{ext}`, confirmed at `upload-policy.ts:87`). AD-3 says the local adapter's `put()` "returns a proxy path (`/api/storage/<key>`)" — the `<key>` placeholder doesn't say whether it's substituted raw (yielding a real multi-segment path, e.g. `/api/storage/event-documents/abc-123/uuid.jpg`, which is what `[...path]` catch-all is built to consume) or percent-encoded as a single opaque token (`encodeURIComponent(key)`, which turns every `/` into `%2F` and collapses the key into what looks like it should be a single dynamic segment, not a catch-all).

Both are plausible independent readings: an adapter author who takes AD-2's "byte-opaque... never construct or interpret its semantics" seriously may reflexively `encodeURIComponent()` the whole key before embedding it in a URL, treating it as an arbitrary opaque string rather than a path. A route author builds `[...path]/route.ts` and reconstructs the key via `params.path.join("/")` — the natural pattern for a catch-all — which only round-trips correctly if the segments were embedded *raw*, not encoded. If the adapter encoded, `%2F` sequences inside a path segment are a documented landmine (inconsistent decode/reject behavior across the Node/Next.js request-parsing stack), and at minimum `params.path.join("/")` will not reproduce the original key.

**Fix:** State explicitly in AD-3/AD-5 that the key's `/` characters are preserved as literal path segments (not percent-encoded) when building the proxy path, and that the route reconstructs via `params.path.join("/")` with no further decoding. Add this as a directly-testable assertion (round-trip `put()` → parse route params → equals original key) since it's cheap to verify and expensive to debug in production.

---

## Finding 5 — No Content-Type/Content-Disposition contract for `read()` or the proxy route [MEDIUM]

**ADs:** AD-1, AD-5.

`read(key): Promise<ReadableStream>` returns bytes only — no mime type, no original filename. AD-3 requires `put()`'s returned URL to be renderable "as-is" via plain `<img src>` (cover images) or `<a href>` (documents), which means the proxy route's `Response` must carry a correct `Content-Type` (and, for documents, ideally `Content-Disposition` with the original filename for a friendly download) — but the spine never says where that metadata comes from. Two builders will guess differently: one infers `Content-Type` from the key's `.ext` suffix inside the route (parsing key structure again — see Finding 3's parsing-ownership gap); another expects the DB row (`documents.name`, and an implicit mime type inferred elsewhere via `inferDocKind`) to already be available to the route and wires a DB lookup by key that nothing in AD-5/AD-6 anticipates (the resolver only returns a `tripId`, not the document row). If the route defaults to no `Content-Type` header, `<img>` tags depend on browser sniffing (unreliable for `.heic`/`.avif`, and this is the whole set of formats in `COVER_UPLOAD_MIME_TYPES`), and `<a href>` PDF previews can force-download instead of opening inline.

**Fix:** Assign explicit ownership: either `read()` returns `{ stream, contentType }` instead of a bare stream, or the route is required to derive `Content-Type` from the key's extension via a shared, spine-owned helper (not ad hoc per-route logic).

---

## Finding 6 — No error taxonomy for "key not found" on `read()`/`del()` [MEDIUM]

**AD:** AD-1.

Neither method's signature says what happens on a missing key. `fs.createReadStream`/`fs.unlink` throw raw `ENOENT` (`NodeJS.ErrnoException`); an S3-style adapter might instead throw a `NoSuchKey` SDK exception, or (per AWS's actual `DeleteObject` semantics) simply resolve successfully on `del()` of a nonexistent object. The proxy route needs to turn "not found" into a `404`, not a `500` — but it can only do that by checking for a specific error shape, and that shape is adapter-specific unless the port defines a canonical `StorageNotFoundError` (or equivalent) that every adapter is required to throw. Without that, a route author who writes `catch (error) { if (isNodeENOENT(error)) return 404 }` against the local adapter silently regresses to `500` the day an S3 adapter is dropped in, despite both being AD-1-compliant.

**Fix:** Add a named error type (or a documented sentinel) to AD-1 that every adapter must throw for "key not found" on `read()`, and specify the same for `del()` (throw vs. resolve) explicitly rather than leaving it to Finding 1's AD-4/AD-8 tension to imply an answer.

---

## Finding 7 — AD-7's process-global singleton has no invalidation hook, and the `db/index.ts` pattern it mirrors was built for a client that's never swapped [MEDIUM]

**AD:** AD-7.

`src/db/index.ts` caches `__pgClient` on `globalThis` purely to survive Next.js dev hot-reload without leaking connections — `DATABASE_URL` is never expected to change within a running process. AD-7 borrows this pattern verbatim for `getStorageAdapter()`, but the storage adapter's entire purpose (per AD-4, "single active backend... selected at process start via `STORAGE_PROVIDER`") is to be *swappable* — and specifically swappable in the one place a single Node process runs multiple configurations back to back: the Vitest worker. `vi.stubEnv` is already the established pattern in this codebase for per-test env overrides (`document-upload-actions.test.ts`, `reservation-document-actions.test.ts`, `actions.test.ts` all use it for `UPLOAD_STUB`). When `local-filesystem-adapter.ts` and (later) `s3-adapter.ts` each get test suites that `vi.stubEnv("STORAGE_PROVIDER", ...)` differently, and those suites share a Vitest worker process, AD-7's "caches the instance on `globalThis`... on first resolution per process" means whichever suite resolves `getStorageAdapter()` first wins for the rest of that worker's lifetime — the second suite silently tests against the wrong (or already-validated, now-stale-config) adapter instance, order-dependently. AD-4 explicitly declares live mid-process switching a non-goal for production ("Redeploy-to-switch is acceptable; live-switching is not a requirement") but says nothing about test-process isolation, leaving each adapter's test author to independently invent a workaround (module-level `vi.resetModules()`, a manual `__resetStorageAdapterForTests()` export, or full module mocking) with no shared convention — exactly the kind of duplicated-differently outcome the rest of the spine tries to avoid.

**Fix:** Either export a test-only reset function from `storage-adapter.ts` (`__resetStorageAdapterCacheForTests()`) as part of AD-7's contract, or explicitly note that adapter unit tests must mock `getStorageAdapter()` wholesale rather than relying on real env-var switching — pick one and state it, since both `local-filesystem-adapter.test.ts` and a future `s3-adapter.test.ts` need to agree before either is written.

---

## Finding 8 — AD-1's `del()` is single-key; existing call sites batch-delete, and the new interface silently drops that shape [LOW-MEDIUM]

**AD:** AD-1, AD-4.

`reservations/actions.ts:210` calls `@vercel/blob`'s `del(blobUrls)` with an **array** of URLs in one call. AD-1's `del(url: string): Promise<void>` is single-key only, so this call site necessarily becomes `Promise.all(urls.map(url => adapter.del(url)))` under the new port — a mechanical migration the spine doesn't call out, but one that changes failure semantics: given Finding 1/6's unresolved throw-vs-swallow ambiguity, if even one URL in the batch throws (e.g., an already-orphaned file, or a permission error per Finding 1), `Promise.all` rejects the whole batch, which can now block a reservation delete that used to best-effort straight through regardless of individual blob failures. Whether that's acceptable depends on answers the spine doesn't give (Findings 1 and 6).

**Fix:** Note the batch→parallel migration explicitly in AD-1 or AD-4, and use `Promise.allSettled` (not `Promise.all`) at documented call sites if best-effort-per-file is the intended behavior — otherwise this regresses silently.

---

## Finding 9 — `del(url)` on a URL from a previously-active backend has no defined behavior, and an existing guard is the evidence this isn't hypothetical [LOW]

**ADs:** AD-3, AD-4.

`cover-upload-actions.ts:45` guards `del(previousUrl)` with `isBlobUploadUrl(previousUrl)` specifically because a trip's `coverImageUrl` can be a leftover Vercel Blob URL from before a policy/backend change — i.e., "call del on a URL a different backend produced" is a real, already-encountered case, not a theoretical one. AD-3 says `del(url)` "must parse the key back out of the URL it produced" (singular, implying the *same* adapter/backend produced it), and AD-4 tolerates cross-backend orphans as a known outcome of a backend switch — but neither AD says what `del()` itself must do when handed a URL it didn't produce (the local adapter, given an old `https://*.public.blob.vercel-storage.com/...` URL post-cutover). If the new call sites drop the old `isBlobUploadUrl`-style guard on the theory that AD-2's opacity means call sites shouldn't URL-sniff anymore, and the adapter's `del()` doesn't independently recognize "not mine" and no-op, the parse step throws on a malformed/foreign URL — reintroducing, inside the adapter, exactly the bug the deleted call-site guard used to prevent.

**Fix:** State explicitly whether "not my URL" is a `del()` no-op (adapter recognizes and skips) or must remain a call-site guard (in which case AD-2's opacity claim needs a carve-out for this one case, and the call-site guard should stay in the migrated code rather than being dropped as "no longer necessary").

---

## Summary Table

| # | Finding | Severity | ADs |
|---|---|---|---|
| 1 | `del()` best-effort (AD-4) vs. fail-loud (AD-8) conflict on the same permission error | HIGH | AD-4, AD-8 |
| 2 | `read()`'s `ReadableStream` type is ambiguous (Web vs. Node) between adapter and route | HIGH | AD-1 |
| 3 | `resolveOwningTripId` signature/vocabulary/not-found behavior unpinned | HIGH | AD-6 |
| 4 | Proxy URL key encoding unspecified — raw segments vs. `encodeURIComponent` break the catch-all round trip | MEDIUM-HIGH | AD-3, AD-5 |
| 5 | No Content-Type/Content-Disposition contract for `read()`/proxy route | MEDIUM | AD-1, AD-5 |
| 6 | No "not found" error taxonomy for `read()`/`del()` | MEDIUM | AD-1 |
| 7 | AD-7 singleton has no invalidation hook; breaks cross-suite test isolation | MEDIUM | AD-7 |
| 8 | `del()` is single-key only; existing batch-delete call site's failure semantics change silently | LOW-MEDIUM | AD-1, AD-4 |
| 9 | No defined behavior for `del()` on a foreign-backend URL; existing guard evidence this is real | LOW | AD-3, AD-4 |
