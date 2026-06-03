# Failure-Mode Inventory — _<module name>_

A planning artifact for modules where reactive PR-feedback churn would be expensive — fill it out **before** writing implementation code so failure modes get enumerated proactively instead of discovered one-at-a-time in review.

## When to use this

Apply for modules with any of:
- **Filesystem state** — multi-step writes, atomic-rename patterns, sidecar files, on-disk caches.
- **Concurrency** — shared in-memory state across callers, in-flight maps, locks.
- **External I/O with failure modes** — network calls, child processes, IPC.
- **Crash-recovery semantics** — code where a process death between two awaits matters.
- **Cross-process state** — anything a prior or concurrent process could have left on disk.

Skip for: simple CRUD endpoints, pure functions, UI components, anything where the only failure mode is "the user gets an error message."

The c.4 firmware cache hit all five criteria and went through ~10 PR-feedback rounds catching real bugs that this template would have surfaced upfront.

---

## 1. External-call error coverage

For each fs / network / IPC call, list the error codes you've considered and the response. Anything in the "TODO" column is a known gap.

| Call | Error / condition | Response |
|------|-------------------|----------|
| _e.g. fsp.readFile(p.meta)_ | _ENOENT_ | _treat as cache miss → return null_ |
| _fsp.readFile(p.meta)_ | _EACCES_ | _treat as miss; logged or silent?_ |
| _fsp.rename(tmp, bin)_ | _EEXIST (Windows)_ | _unlink-before-rename in step N_ |
| _fsp.rename(tmp, bin)_ | _EXDEV (cross-fs)_ | _propagate; cache root must be on one fs_ |
| _fetcher(url)_ | _stalled connection_ | _AbortController fires after timeout_ |
| _fetcher(url)_ | _truncated body_ | _size check after pipeline; hard fail_ |
| _writeFile(p.X)_ | _ENOSPC_ | _persist-phase catch unlinks partial state_ |

**Common gotchas** the c.4 experience surfaced:
- A "successful" HTTP response with a truncated body looks like a normal close — no stream error fires.
- `fs.rename` is not atomic across filesystems; bind-mounts and Docker volumes are easy ways to introduce EXDEV.
- macOS HFS+ is case-insensitive by default; uppercase/lowercase tag variants can collide.
- A `JSON.parse('{}')` succeeds and casts cleanly to your interface but every field is undefined.

---

## 2. Crash-recovery state matrix

For each multi-step write/promote sequence, table the on-disk state at every `await` boundary. Mark each row: **miss** / **hit-consistent** / **hit-inconsistent**. Any "hit-inconsistent" row is a bug.

_Example for c.4's persist phase (post-fix):_

| After step | tmp | bin | sha | meta | lookup() returns | Status |
|------------|-----|-----|-----|------|------------------|--------|
| Before persist | new | stale-or-absent | absent | absent | null (no sidecars) | miss ✓ |
| unlink stale .bin | new | absent | absent | absent | null | miss ✓ |
| rename .tmp → .bin | absent | new | absent | absent | null (no sidecars) | miss ✓ |
| writeFile .sha | absent | new | new | absent | null (no meta) | miss ✓ |
| writeFile .meta | absent | new | new | new | hit, consistent | hit ✓ |

The pre-fix order had `writeFile sha → writeFile meta → unlink → rename`, which produced this row mid-sequence:

| After writeFile meta (pre-fix) | absent | **stale** | **new** | **new** | hit, **bytes ≠ hash** | **inconsistent ✗** |

— a row this matrix would have flagged in 5 minutes of paperwork.

---

## 3. Concurrency state

For each shared resource (in-memory map, on-disk file, lock), list:
- **Who else can touch it?** (concurrent fetches on the same key, on different keys, pruneToN, lookup, an external process)
- **Synchronization mechanism.**
- **What if synchronization is missed?** (corruption, transient error, deadlock, etc.)

_Example:_
- **inFlight Map:** keyed by `${version}::${variant}`. Concurrent `fetch()` on same key shares one Promise. Sync: synchronous `Map.set` before any await. Miss: pruneToN's snapshot of inFlight could be stale; a fetch whose `Map.set` runs after the snapshot but whose `.tmp` existed beforehand could lose its tmp. Bounded by: stream errors, user retries succeed, no data corruption.

---

## 4. Cross-platform / cross-environment differences

For each fs / OS-touching operation, list any platform variation.

- **`fs.rename`:** POSIX overwrites atomically; Windows throws `EEXIST`. → Mitigation: unlink dest before rename.
- **Path separators:** never literal `/` or `\`; always `path.join`.
- **Filename case:** macOS HFS+ case-insensitive by default; check whether case-variant collisions matter for your keys.
- **`appdata-path`:** different roots on Linux/macOS/Windows; tests must not assume any specific layout.
- **Filesystem features:** `chmod` / `xattr` / symlinks may not be portable; avoid unless required.
- **Container quirks:** bind-mounts can introduce EXDEV across what looks like one path; tmpfs vs disk perf differs by orders of magnitude.

---

## 5. Pre-existing on-disk state

The "fresh start" code path may find leftover state from a prior process. List each state and the response.

_Example for c.4:_
- **Orphan `.tmp`** (download crashed) → swept by pruneToN.
- **Orphan `.bin` without sidecars** → unlinked at start of persist phase OR swept by pruneToN-via-malformed-meta path on next prune.
- **Malformed `.meta.json`** → swept by pruneToN along with siblings.
- **Stale `.bin` + valid sidecars from a prior version** → lookup hits and serves; if hash check downstream catches mismatch, that's a corruption signal, not a routine miss.
- **Cache directory has wrong permissions** → readdir throws non-ENOENT, propagates so operator sees the warning.

---

## 6. Hostile / malformed input

For each input crossing a trust boundary, list the defense.

_Example for c.4:_
- **`asset.version` from upstream:** validated against `PATH_SAFE_RE` before path interpolation. Upstream c.3's `(.+)` capture is permissive; cache must not trust it.
- **`asset.variant`:** upstream-constrained but validated here for defense-in-depth.
- **`.meta.json` content from disk:** `isValidMeta` predicate gates type narrowing; JSON content never used for path construction (only Dirent.name).
- **Response body:** size verified against `AssetInfo.sizeBytes`; hash computed during stream.
- **`FIRMWARE_CACHE_PATH` env var:** `%appdata%` sentinel handled; otherwise used verbatim (operator-trusted).

---

## 7. Resource lifecycle audit

For each resource the module creates, list **where it's created**, **where cleanup is supposed to happen**, and **what if cleanup doesn't run** (process death, missed catch, etc.).

| Resource | Created | Cleanup happy path | If cleanup doesn't run |
|----------|---------|--------------------|------------------------|
| _.tmp file_ | _streamDownload_ | _download-fail catch / persist-fail catch_ | _swept by pruneToN as orphan_ |
| _inFlight entry_ | _fetch()_ | _.finally on the work promise_ | _process dies → in-memory state gone, fresh start sees nothing_ |
| _AbortController timer_ | _streamDownload_ | _clearTimeout in finally_ | _GC eventually; harmless_ |
| _filesystem watcher / interval / child process_ | _..._ | _..._ | _..._ |

Anywhere "if cleanup doesn't run" is "permanent leak" or "inconsistent state," that's a place to either add a sweep mechanism or accept the risk explicitly.

---

## 8. Reviewer pre-flight

Before opening the PR, walk through the code with these questions. Treat every "I'm not sure" as a gap to fix or document.

- [ ] For each `await` in a sequence: what does on-disk state look like if the process dies right here? (Cross-reference with §2.)
- [ ] For each `try { ... } catch`: does the catch leave on-disk state consistent with what `lookup()` returns? (No partial writes that look like hits.)
- [ ] For each fs/network call: did you list every error code in §1, or only the ones the happy path expects?
- [ ] For each shared resource: did §3's "miss synchronization" answer match the actual code?
- [ ] For each "this looks unused" or "this is defensive against an impossible case": is it really impossible? Or just impossible-on-the-machine-you-tested?
- [ ] Did you run the code path on Windows? (If no, did §4's Windows row get a real test?)
- [ ] For every category of file the module writes: is there a sweep or eviction path that handles the orphan version?

If a category in this template is "N/A for this module," say so explicitly. An empty section in the plan is a "didn't think about it" signal; an "N/A: this module is pure compute" is a "did think, doesn't apply" signal.

---

## How this maps to the plan

When a feature plan covers a module that warrants this inventory:
1. Copy the headings (§1 through §7) into a `## Failure modes` section in the plan.
2. Fill them out before writing implementation code.
3. Commit the plan with the inventory filled in. (Same "commit the plan first" rule from CLAUDE.md.)
4. As implementation lands, mark items done or amend with new findings.
5. Pre-flight (§8) runs against the implementation, not the plan — it's the gate before opening the PR.

The c.4 cache went through ~10 PR-feedback rounds catching real bugs (Windows rename, hung downloads, mismatched-bytes hit, unbounded garbage). Most would have been surfaced by §1 + §2 in the planning phase.
