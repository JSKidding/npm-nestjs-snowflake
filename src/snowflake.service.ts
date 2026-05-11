import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { Connection, Pool } from 'snowflake-sdk';
import { SNOWFLAKE_POOL } from './snowflake.constants';
import {
  executeOnConnection,
  SnowflakeBinds,
} from './snowflake-execute';
import { SnowflakeTransaction } from './snowflake-transaction';

@Injectable()
export class SnowflakeService implements OnApplicationShutdown {
  private readonly logger = new Logger(SnowflakeService.name);

  constructor(
    @Inject(SNOWFLAKE_POOL) private readonly pool: Pool<Connection>,
  ) {}

  execute<T = unknown>(sqlText: string, binds?: SnowflakeBinds): Promise<T[]> {
    return this.pool.use((connection) =>
      executeOnConnection<T>(connection, sqlText, { binds }),
    );
  }

  async *executeStream<T = unknown>(
    sqlText: string,
    binds?: SnowflakeBinds,
  ): AsyncGenerator<T, void, void> {
    const connection = await this.pool.acquire();
    try {
      const stream = await new Promise<NodeJS.ReadableStream>(
        (resolve, reject) => {
          connection.execute({
            sqlText,
            binds,
            streamResult: true,
            complete: (err, stmt) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(stmt.streamRows());
            },
          });
        },
      );

      for await (const row of stream) {
        yield row as T;
      }
    } finally {
      await this.pool.release(connection);
    }
  }

  async withTransaction<T>(
    fn: (tx: SnowflakeTransaction) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.acquire();
    try {
      await executeOnConnection(connection, 'BEGIN');
      try {
        const result = await fn(new SnowflakeTransaction(connection));
        await executeOnConnection(connection, 'COMMIT');
        return result;
      } catch (err) {
        try {
          await executeOnConnection(connection, 'ROLLBACK');
        } catch (rollbackErr) {
          this.logger.error(
            'Failed to ROLLBACK after transaction error',
            rollbackErr instanceof Error ? rollbackErr.stack : rollbackErr,
          );
        }
        throw err;
      }
    } finally {
      await this.pool.release(connection);
    }
  }

  getConnection(): Promise<Connection> {
    return this.pool.acquire();
  }

  release(connection: Connection): Promise<void> {
    return this.pool.release(connection);
  }

  getPool(): Pool<Connection> {
    return this.pool;
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.pool.drain();
      await this.pool.clear();
    } catch (err) {
      this.logger.error(
        'Error while draining Snowflake pool',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
