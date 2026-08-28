# TableCraft — Install Guide

TableCraft is a database browsing/editing tool (MySQL, PostgreSQL) — similar to DBeaver/TablePlus.

## 1. Installing

1. Get the installer, e.g. `TableCraft Setup 0.2.0.exe`.
2. Run it. Windows will show a blue **"Windows protected your PC"** warning — this is expected
   (it's an internal app, not signed with a Microsoft certificate, **not a virus**). Click
   **More info**, then **Run anyway** to continue.
3. Follow the installer (pick an install location or leave the default) → **Install**.
4. No admin rights required; it won't affect other users on the same machine.

## 2. First launch — add a database connection

1. Open TableCraft, click the **＋** button (top-left, next to "CONNECTIONS") or **+ New Connection**.
2. Fill in the database details (ask your DB admin if you don't have them):
   - **Driver**: MySQL/MariaDB or PostgreSQL
   - **Host**, **Port**
   - **User**, **Password**
   - **Database**
   - Optionally assign a **Group** and/or star it as a **Favorite** to keep a long connection list organized.
3. If the database is only reachable through a jump/bastion host, turn on **Connect via SSH Tunnel** and
   fill in the SSH host/user and either a password or a private key (paste it or **Browse…** to a key file).
4. Click **Test Connection** to verify before saving.
5. Click **Save**.

> Note: each user has to enter their own connection — a config file copied from another
> machine won't work (passwords, and SSH credentials, are encrypted per machine/Windows account).

## 3. Handy keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+S | Save pending changes (edited/added/deleted rows) |
| Ctrl+R | Reload the current tab's data/structure |
| Ctrl+C / Ctrl+V | Copy / paste selected row(s) |
| Ctrl+D | Duplicate the selected row(s) |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Delete | Mark selected row(s) for deletion (only deleted for real on Save) |
| Middle-click a tab | Close that tab |

## 4. Need help?

If you can't connect to the database, check:
- Whether your machine is on the company network / VPN (if the DB isn't publicly reachable).
- That the host/port/user/password are correct.
- Contact your database admin or whoever sent you this app.
