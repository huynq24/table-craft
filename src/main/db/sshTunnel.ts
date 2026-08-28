import { Client } from 'ssh2'
import net from 'net'
import type { SshTunnelConfig } from '@shared/types'

export interface TunnelHandle {
  localPort: number
  close(): void
}

/**
 * Opens a local TCP forward through an SSH server (equivalent to `ssh -L`): connects to
 * `ssh.host`, then for every connection accepted on a local ephemeral port, asks the SSH
 * server to forward it on to `dbHost:dbPort` and pipes the two sockets together.
 */
export function openSshTunnel(ssh: SshTunnelConfig, dbHost: string, dbPort: number): Promise<TunnelHandle> {
  return new Promise((resolve, reject) => {
    const client = new Client()

    client.on('ready', () => {
      const localServer = net.createServer((localSocket) => {
        client.forwardOut(localSocket.remoteAddress ?? '127.0.0.1', localSocket.remotePort ?? 0, dbHost, dbPort, (err, stream) => {
          if (err) {
            localSocket.destroy()
            return
          }
          localSocket.pipe(stream)
          stream.pipe(localSocket)
          stream.on('close', () => localSocket.destroy())
          localSocket.on('close', () => stream.destroy())
          localSocket.on('error', () => stream.destroy())
          stream.on('error', () => localSocket.destroy())
        })
      })

      localServer.on('error', (err) => {
        client.end()
        reject(err)
      })

      // Bind to loopback only, on an OS-assigned free port — the DB adapter connects to
      // this instead of the real (possibly firewalled) host:port.
      localServer.listen(0, '127.0.0.1', () => {
        const address = localServer.address()
        const localPort = typeof address === 'object' && address ? address.port : 0
        resolve({
          localPort,
          close: () => {
            localServer.close()
            client.end()
          }
        })
      })
    })

    client.on('error', (err) => reject(err))

    client.connect({
      host: ssh.host,
      port: ssh.port,
      username: ssh.user,
      password: ssh.authMethod === 'password' ? ssh.password : undefined,
      privateKey: ssh.authMethod === 'privateKey' ? ssh.privateKey : undefined,
      passphrase: ssh.authMethod === 'privateKey' ? ssh.passphrase || undefined : undefined
    })
  })
}
