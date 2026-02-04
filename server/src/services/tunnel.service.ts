import { v4 as uuidv4 } from 'uuid';
import { mqttclient } from '../databases/mqttclient';
import { createServer } from 'node:net';
import { Mutex, MutexInterface, Semaphore, SemaphoreInterface, withTimeout } from 'async-mutex';

const TUNNEL_CHUNK_SIZE = 512;
const MAX_PACKET_LENGTH = 1000;
const PARALLEL_TUNNEL_CONNECTIONS = 1;

type TunnelStreamTxData = {
  connection_id: string;
  host: string;
  port: number;
} & ({ disconnected: true; payload?: string } | { disconnected?: false; payload: string });

type TunnelStreamRxData = Pick<TunnelStreamTxData, 'connection_id' | 'payload' | 'disconnected'> & {
  sequence: number;
};

type TunnelConnectionData = {
  nextSequence: number;
  lastActivityTime: number;
  handler: (payload: TunnelStreamRxData['payload']) => void;
  queue: TunnelStreamRxData[];
  handleDisconnect: (error?: Error) => void;
  acquire: Promise<[number, SemaphoreInterface.Releaser]>;
  release?: SemaphoreInterface.Releaser;
};

class TunnelService {
  private deviceIdToTunnelConnection = new Map<string, Map<string, TunnelConnectionData>>();
  private deviceIdToSemaphore = new Map<string, SemaphoreInterface>();

  public onTunnelReadDataReceived(device_id: string, data: string): Promise<void> {
    try {
      const parsed: TunnelStreamRxData = JSON.parse(data);

      const connection = this.deviceIdToTunnelConnection.get(device_id)?.get(parsed.connection_id);
      if (!connection) {
        return;
      }

      connection.queue.push(parsed);

      let nextData: TunnelStreamRxData;
      while ((nextData = connection.queue.find(d => d.sequence === connection.nextSequence))) {
        if (nextData.disconnected) {
          connection.handleDisconnect();
          break;
        } else {
          this.reportTunnelActivity(device_id, parsed.connection_id);
          connection.queue = connection.queue.filter(d => d.sequence > nextData.sequence);
          connection.handler(nextData.payload);
        }
        connection.nextSequence++;
      }
    } catch (e) {
      console.log('Error parsing tunnel data received:', e);
    }

    return Promise.resolve();
  }

  public async createTunnelProxyServer(streamUrl: URL, device_id: string): Promise<string> {
    const port = streamUrl.port
      ? parseInt(streamUrl.port)
      : streamUrl.protocol === 'rtsp:'
      ? 554
      : streamUrl.protocol === 'rtsps:'
      ? 322
      : streamUrl.protocol === 'rtmp:'
      ? 1935
      : ['rtmps:', 'https:'].includes(streamUrl.protocol)
      ? 443
      : 80;

    return new Promise<string>((resolve, reject) => {
      const server = createServer(client => {
        const connectionId = uuidv4();

        if (!this.deviceIdToSemaphore.has(device_id)) {
          this.deviceIdToSemaphore.set(
            device_id,
            withTimeout(new Semaphore(PARALLEL_TUNNEL_CONNECTIONS), 300_000, new Error('Tunnel device mutex timeout')),
          );
        }
        if (!this.deviceIdToTunnelConnection.has(device_id)) {
          this.deviceIdToTunnelConnection.set(device_id, new Map());
        }

        const connection: TunnelConnectionData = {
          handler: payload => {
            if (client.destroyed) {
              return;
            }

            this.reportTunnelActivity(device_id, connectionId);

            client.write(new Uint8Array(Buffer.from(payload, 'base64')), err => {
              if (err) {
                client.destroy(err);
              }
            });
          },
          lastActivityTime: Date.now(),
          nextSequence: 0,
          queue: [],
          handleDisconnect: error => client.destroy(error),
          acquire: this.deviceIdToSemaphore.get(device_id).acquire(),
        };

        this.deviceIdToTunnelConnection.get(device_id).set(connectionId, connection);

        let timeoutHandle: NodeJS.Timeout;
        const timeoutAfterActivity = () => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }

          timeoutHandle = setTimeout(() => {
            if (Date.now() - (connection.lastActivityTime || 0) >= 15000) {
              client.destroy();
            } else {
              timeoutAfterActivity();
            }
          }, 1000);
        };

        client.once('close', () => {
          if (!this.moduleHasDisconnected(device_id, connectionId)) {
            const message: TunnelStreamTxData = {
              connection_id: connectionId,
              disconnected: true,
              host: streamUrl.hostname,
              port,
            };
            mqttclient.publish('/devices/' + device_id + '/tunnel_write', JSON.stringify(message));
          }

          connection.release?.();
          this.deviceIdToTunnelConnection.get(device_id)?.delete(connectionId);
        });
        client.setEncoding('binary');
        client.on('data', data => {
          this.onClientDataReceived(device_id, { connection_id: connectionId, host: streamUrl.hostname, port }, data).then(() =>
            timeoutAfterActivity(),
          );
        });

        client.on('error', err => {
          // Ignore errors, as they are handled in 'close' event
        });
      });

      server.listen(
        {
          port: 0,
          host: '127.0.0.1',
        },
        () => {
          const url = new URL(streamUrl.toString());
          url.hostname = '127.0.0.1';
          url.port = String((server.address() as any).port);
          console.log(
            'Tunnel proxy server listening on',
            (server.address() as any).port,
            'proxying to',
            streamUrl.hostname + ':' + port,
            'for device',
            device_id,
          );
          resolve(url.toString());
        },
      );
      server.on('error', (err: any) => {
        reject(err);
      });

      setTimeout(() => {
        server.close(err => {
          if (err) {
            console.log('Error closing tunnel proxy server on timeout:', err);
          }
        });
        reject(new Error('Timeout creating tunnel proxy server'));
      }, 300_000);
    });
  }

  private reportTunnelActivity(device_id: string, connection_id: string): void {
    const connection = this.deviceIdToTunnelConnection.get(device_id)?.get(connection_id);
    if (connection) {
      connection.lastActivityTime = Date.now();
    }
  }

  private moduleHasDisconnected(device_id: string, connection_id: string): boolean {
    return (
      this.deviceIdToTunnelConnection
        .get(device_id)
        ?.get(connection_id)
        ?.queue?.find(d => d.disconnected)?.disconnected || false
    );
  }

  private onClientDataReceived(
    device_id: string,
    metadata: Pick<TunnelStreamTxData, 'connection_id' | 'host' | 'port'>,
    data: Buffer,
  ): Promise<void> {
    data = Buffer.from(data);

    const connection = this.deviceIdToTunnelConnection.get(device_id)?.get(metadata.connection_id);

    return connection?.acquire?.then(([number, release]) => {
      if (this.deviceIdToTunnelConnection.get(device_id)?.has(metadata.connection_id)) {
        connection.release = release;
      } else {
        release();
        return;
      }

      if (!this.moduleHasDisconnected(device_id, metadata.connection_id)) {
        while (data.length > 0) {
          const chunk = Buffer.from(data.slice(0, TUNNEL_CHUNK_SIZE));
          data = Buffer.from(data.slice(TUNNEL_CHUNK_SIZE));
          const message: TunnelStreamTxData = {
            ...metadata,
            payload: chunk.toString('base64'),
          };
          const rawMessage = JSON.stringify(message);
          if (rawMessage.length > MAX_PACKET_LENGTH) {
            connection.handleDisconnect(new Error(`Packet length (${rawMessage.length}) exceeds the maximum length of ${MAX_PACKET_LENGTH}`));
            return;
          }

          this.reportTunnelActivity(device_id, metadata.connection_id);
          mqttclient.publish('/devices/' + device_id + '/tunnel_write', rawMessage);
        }
      }
    });
  }
}

export const tunnelService = new TunnelService();
