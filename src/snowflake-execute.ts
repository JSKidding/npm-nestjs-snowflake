import type { Connection, Binds } from 'snowflake-sdk';

export type SnowflakeBinds = Binds;

export interface ExecuteOptions {
  binds?: SnowflakeBinds;
}

export function executeOnConnection<T = unknown>(
  connection: Connection,
  sqlText: string,
  options: ExecuteOptions = {},
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    connection.execute({
      sqlText,
      binds: options.binds,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((rows ?? []) as T[]);
      },
    });
  });
}
