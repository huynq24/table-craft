import type { ConnectionConfig } from '@shared/types'
import type { DbAdapter } from './adapter'
import { MysqlAdapter } from './mysqlAdapter'
import { PostgresAdapter } from './postgresAdapter'

/** Holds one live adapter instance per open connection tab. */
class ConnectionManager {
  private adapters = new Map<string, DbAdapter>()
  private configs = new Map<string, ConnectionConfig>()

  async connect(config: ConnectionConfig): Promise<void> {
    const adapter: DbAdapter = config.driver === 'mysql' ? new MysqlAdapter() : new PostgresAdapter()
    await adapter.connect(config)
    // close any previous adapter for this id first
    await this.disconnect(config.id)
    this.adapters.set(config.id, adapter)
    this.configs.set(config.id, config)
  }

  async disconnect(id: string): Promise<void> {
    const existing = this.adapters.get(id)
    if (existing) {
      await existing.disconnect().catch(() => {})
      this.adapters.delete(id)
      this.configs.delete(id)
    }
  }

  get(id: string): DbAdapter {
    const adapter = this.adapters.get(id)
    if (!adapter) throw new Error('Not connected. Open the connection first.')
    return adapter
  }

  getConfig(id: string): ConnectionConfig | undefined {
    return this.configs.get(id)
  }

  isConnected(id: string): boolean {
    return this.adapters.has(id)
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.adapters.keys()].map((id) => this.disconnect(id)))
  }
}

export const connectionManager = new ConnectionManager()
