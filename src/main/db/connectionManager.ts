import type { ConnectionConfig } from '@shared/types'
import type { DbAdapter } from './adapter'
import { MysqlAdapter } from './mysqlAdapter'
import { PostgresAdapter } from './postgresAdapter'
import { openSshTunnel, type TunnelHandle } from './sshTunnel'

/** Holds one live adapter instance per open connection tab. */
class ConnectionManager {
  private adapters = new Map<string, DbAdapter>()
  private configs = new Map<string, ConnectionConfig>()
  private tunnels = new Map<string, TunnelHandle>()

  async connect(config: ConnectionConfig): Promise<void> {
    // close any previous adapter/tunnel for this id first
    await this.disconnect(config.id)

    let connectConfig = config
    let tunnel: TunnelHandle | undefined
    if (config.ssh?.enabled) {
      tunnel = await openSshTunnel(config.ssh, config.host, config.port)
      connectConfig = { ...config, host: '127.0.0.1', port: tunnel.localPort }
    }

    const adapter: DbAdapter = config.driver === 'mysql' ? new MysqlAdapter() : new PostgresAdapter()
    try {
      await adapter.connect(connectConfig)
    } catch (err) {
      tunnel?.close()
      throw err
    }
    this.adapters.set(config.id, adapter)
    // Keep the *original* (un-tunneled) config so display/defaultSchema logic never sees
    // the tunnel's local loopback address.
    this.configs.set(config.id, config)
    if (tunnel) this.tunnels.set(config.id, tunnel)
  }

  async disconnect(id: string): Promise<void> {
    const existing = this.adapters.get(id)
    if (existing) {
      await existing.disconnect().catch(() => {})
      this.adapters.delete(id)
      this.configs.delete(id)
    }
    const tunnel = this.tunnels.get(id)
    if (tunnel) {
      tunnel.close()
      this.tunnels.delete(id)
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
