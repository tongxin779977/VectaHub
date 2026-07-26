# src/execution/ — Execution Records & Lifecycle

## OVERVIEW

Flat persistence + lifecycle layer: JSONL ExecutionRecord storage, per-step stdout/stderr output, rerun/resume, gzip archival, and diagnostic task queue. Backs the `history`/`detail`/`rerun`/`resume`/`archive`/`queue` CLI commands.

## STRUCTURE

```
types.ts            # ExecutionRecord, StepExecution, ExecutionFilter, ExecutionMetadata, OutputReference
interfaces.ts       # IRecordManager, IOutputStore, IQueueManager, ILifecycleManager, IArchiver
record-manager.ts   # createRecordManager — JSONL append + date-partitioned query
output-store.ts     # createOutputStore — per-step stdout/stderr file storage
lifecycle.ts        # createLifecycleManager — rerun/resume by re-injecting record into workflow engine
archiver.ts         # createArchiver — gzip old records, move to archive dir
queue-manager.ts    # getQueueManager / getQueueManagerForProject — file-locked task queue
id-generator.ts     # generateId → exec_YYYYMMDD_HHMMSS_<8hex>, parseTimestamp()
utils.ts            # parseStartedAt(), toDatePartitionKey()
index.ts            # barrel re-export
```

## WHERE TO LOOK

| Task | File(s) |
|---|---|
| Add a field to execution records | `types.ts` (shape) → `record-manager.ts` (write path) |
| Change JSONL storage format | `record-manager.ts` (append + partition logic) |
| Change execution ID scheme | `id-generator.ts` |
| Wire a new lifecycle operation | `lifecycle.ts` (rerun/resume pattern) |
| Archive strategy tuning | `archiver.ts` |
| Queue diagnostics / lock debugging | `queue-manager.ts` |
| Per-step output layout | `output-store.ts` |
| Export / query execution history | `record-manager.ts` (query + filter methods) |

## CONVENTIONS

- **All modules are DI-friendly factories**: every module exports a `create*` or `get*` function that accepts an `InfrastructureContext` (logger, environment, audit). No module calls `getDefaultContext()` directly.
- **JSONL is the only write format**: `record-manager.ts` appends one JSON line per ExecutionRecord. Partitioning is date-based (`YYYY-MM-DD`), no multi-day scans.
- **id-generator produces timestamped sortable IDs**: `exec_20260726_143052_a1b2c3d4`. `parseTimestamp()` recovers the instant without reading the record body.
- **output-store lays out stdout/stderr per step under `.vectahub/output/<execId>/<stepIndex>/`**: consumers reference via `OutputReference` (file path + byte offset), never inline large output blobs.
- **lifecycle.ts re-drives the workflow engine**: rerun reads the stored ExecutionRecord, constructs a fresh workflow context, and runs it again. It does not replay persisted step state byte-for-byte.
- **queue-manager uses file locking** (not in-memory): `getQueueManagerForProject()` resolves a `.queue.lock` per project directory. Singleton `getQueueManager()` is for the default project.
- **Record storage is date-partitioned only**: no hash-based sharding, no multi-index. All queries filter by `startedAt` range. Don't add secondary indexes here — that's an export/ETL concern.
- **Persistence field changes are behavior changes**: per parent AGENTS.md, any addition, rename, or semantic shift to a persisted field requires a characterization test and a written writer/reader compatibility expectation.

## ANTI-PATTERNS

- **Don't call `getDefaultContext()`.** Use the `InfrastructureContext` parameter passed to the factory function.
- **Don't inline large output in ExecutionRecord.** Use `output-store.ts` + `OutputReference`. The JSONL line must stay compact.
- **Don't add a new storage backend alongside JSONL.** All queries flow through `IRecordManager`; if you need indexing, export to an external store rather than adding a second write path.
- **Don't assume queue locks are cross-machine safe.** File locking is local-only. Multi-node queueing is out of scope.
- **Don't change ID format without updating `parseTimestamp()`.** Every consumer that extracts the timestamp from an execution ID must keep working.
- **Don't use lifecycle.ts route for partial/selective replay.** Rerun and resume execute the full workflow. Partial step replay belongs in the workflow engine, not here.
