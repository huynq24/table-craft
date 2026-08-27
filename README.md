# TableCraft

A TablePlus-like database GUI client for Windows, built with Electron, React, and TypeScript. Supports MySQL/MariaDB and PostgreSQL.

## Features

**Connections**
- Manage multiple saved connections (MySQL/MariaDB and PostgreSQL); passwords are encrypted at rest via Electron's `safeStorage`.
- Test a connection before saving it.
- Search tables by name in the sidebar.

**Browsing & editing data**
- Browse tables, view and edit data inline (double-click a cell to edit; unsaved edits are highlighted).
- Add and delete rows.
- Column-based filter builder — pick a column, an operator, and a value instead of hand-typing SQL — plus an "Advanced SQL" mode for a raw `WHERE` clause.
- Sort by clicking a column header.
- Configurable page size (rows per page) with Prev/Next pagination.
- Ctrl+S saves pending edits; Ctrl+R reloads the active tab's data/structure.

**Table structure**
- View, add, edit, and drop columns.
- Search columns by name.
- View indexes and foreign keys.
- Drop table.

**SQL query editor**
- CodeMirror-based editor with SQL syntax highlighting.
- Autocomplete suggests real table and column names from the connected database, not just keywords.
- Typing `JOIN` prioritizes tables related by foreign key to what's already in the query, and pre-fills the `ON` clause.
- Query results are paginated client-side so large result sets don't stall the UI.
- Export query results to CSV/JSON.
- Query history per connection, with search and one-click reuse of a past query.

**Import/Export**
- Export table data to CSV/JSON (respects the active filter).
- Export query results to CSV/JSON.
- Import CSV into a table.

**UI**
- Light and dark theme, toggle in the sidebar, remembered across restarts.
- Multiple tabs: each table or query is its own tab; multiple connections can be open at once.

## Getting started

```bash
npm install
npm run dev        # run in dev mode with hot-reload
npm run build       # production build into out/
npm run dist         # build + package a Windows installer (NSIS) into dist/
npm run typecheck  # type-check both the main and renderer processes
```

## Architecture

- `src/main/` — Electron main process.
  - `db/adapter.ts` — the `DbAdapter` interface every driver implements.
  - `db/mysqlAdapter.ts`, `db/postgresAdapter.ts` — MySQL and PostgreSQL drivers.
  - `db/connectionManager.ts` — holds the live adapter instance per open connection.
  - `store.ts` — persists saved connections to `%APPDATA%/TableCraft/connections.json`.
  - `historyStore.ts` — persists query history to `%APPDATA%/TableCraft/query-history.json`.
  - `ipc.ts` — all IPC handlers exposed to the renderer.
- `src/preload/` — `contextBridge`-based bridge exposing a typed `window.api` to the renderer.
- `src/renderer/` — the React UI.
  - `components/Sidebar.tsx` — connection and table list.
  - `components/TableView.tsx` — Data + Structure tabs for a table.
  - `components/StructureView.tsx` — column/index/foreign-key management.
  - `components/QueryEditor.tsx` — SQL editor, results, and query history panel.
  - `components/DataGrid.tsx` — shared editable data grid.
  - `components/ConnectionModal.tsx` — add/edit connection form.
  - `store/appStore.ts` — tabs, connections, and UI state (Zustand).
  - `store/themeStore.ts` — light/dark theme, persisted to `localStorage`.
  - `lib/sqlCompletion.ts` — builds the FK relationship map and the JOIN-aware autocomplete source.
- `src/shared/types.ts` — types shared between the main and renderer processes.

## Adding a new database driver

Implement the `DbAdapter` interface in `src/main/db/adapter.ts` (see `mysqlAdapter.ts` for reference) and register it in `connectionManager.ts`. SQLite and SQL Server are not implemented yet but the architecture supports adding them this way.

## Current limitations

- Editing or deleting rows requires the table to have a primary key.
- The SQL editor executes one statement at a time (multiple statements are not enabled).
- SQLite and SQL Server are not supported yet.

## Distributing to other users

See [INSTALL.md](INSTALL.md) — a short install guide meant to be handed to recipients along
with `dist/TableCraft Setup <version>.exe`. Things to know before sending it out:

- **Not code-signed** — Windows SmartScreen will warn on first run ("Windows protected your PC").
  Recipients click *More info → Run anyway*. Worth a heads-up so it doesn't read as malware.
- **Saved connections don't transfer between machines/accounts** — passwords are encrypted via
  Electron's `safeStorage`, which is tied to the Windows user account that encrypted them.
  Copying `connections.json` to someone else's machine won't decrypt. Each recipient adds their
  own connection via **+ New Connection**.
- **No auto-update** — a new version means building again (`npm run dist`) and re-sending the
  installer. Bump `version` in `package.json` first so recipients can tell builds apart.
- Installs per-user (`perMachine: false`), so recipients don't need admin rights.
