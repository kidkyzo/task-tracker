# SQLite access decision

P0-12 uses Node's built-in `node:sqlite` module, specifically `DatabaseSync`.

The module avoids a native addon dependency and works with the project's local, single-process server and modest event volume. Synchronous calls briefly block the event loop, so database work must stay small and each ingestion must perform its transaction without awaiting. If measured load shows this is a bottleneck, revisit the decision before adding a database package.

The runtime floor is Node.js 22.13.0. Node documents `node:sqlite` as introduced in 22.5; starting with 22.13 it no longer requires the experimental CLI flag, though it remains experimental in that release line. The installed Node 24.11 runtime also reports the module as experimental. This is an accepted trade-off for avoiding a native dependency; database access stays behind `server/db` so a package can replace it later. See the [Node.js SQLite API documentation](https://nodejs.org/api/sqlite.html).
