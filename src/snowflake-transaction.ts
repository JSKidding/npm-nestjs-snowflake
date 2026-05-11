import type { Connection } from 'snowflake-sdk';
import { executeOnConnection, SnowflakeBinds } from './snowflake-execute';

export class SnowflakeTransaction {
  constructor(private readonly connection: Connection) {}

  execute<T = unknown>(sqlText: string, binds?: SnowflakeBinds): Promise<T[]> {
    return executeOnConnection<T>(this.connection, sqlText, { binds });
  }

  getConnection(): Connection {
    return this.connection;
  }
}
