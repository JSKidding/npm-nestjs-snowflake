import { Readable } from 'stream';
import type { Connection, Pool } from 'snowflake-sdk';
import { SnowflakeService } from '../src/snowflake.service';
import { SnowflakeTransaction } from '../src/snowflake-transaction';

type ExecuteOpts = {
  sqlText: string;
  binds?: unknown;
  streamResult?: boolean;
  complete: (err: Error | null, stmt: unknown, rows?: unknown[]) => void;
};

function makeConnection(handler: (opts: ExecuteOpts) => void): Connection {
  return {
    execute: (opts: ExecuteOpts) => {
      handler(opts);
      return { streamRows: () => Readable.from([]) } as unknown;
    },
  } as unknown as Connection;
}

function makePool(connection: Connection): {
  pool: Pool<Connection>;
  released: Connection[];
  drained: boolean;
} {
  const released: Connection[] = [];
  const state = { drained: false };
  const pool = {
    use: async <R>(fn: (c: Connection) => Promise<R>) => fn(connection),
    acquire: async () => connection,
    release: async (c: Connection) => {
      released.push(c);
    },
    drain: async () => {
      state.drained = true;
    },
    clear: async () => undefined,
  } as unknown as Pool<Connection>;
  return { pool, released, get drained() { return state.drained; } } as {
    pool: Pool<Connection>;
    released: Connection[];
    drained: boolean;
  };
}

describe('SnowflakeService', () => {
  describe('execute', () => {
    it('resolves with rows returned by snowflake-sdk', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      const conn = makeConnection(({ complete }) => complete(null, {}, rows));
      const { pool } = makePool(conn);
      const service = new SnowflakeService(pool);

      await expect(service.execute('SELECT 1')).resolves.toEqual(rows);
    });

    it('passes sqlText and binds through', async () => {
      const captured: ExecuteOpts[] = [];
      const conn = makeConnection((opts) => {
        captured.push(opts);
        opts.complete(null, {}, []);
      });
      const { pool } = makePool(conn);
      const service = new SnowflakeService(pool);

      await service.execute('SELECT ?', [42]);

      expect(captured).toHaveLength(1);
      expect(captured[0].sqlText).toBe('SELECT ?');
      expect(captured[0].binds).toEqual([42]);
    });

    it('rejects when snowflake-sdk reports an error', async () => {
      const conn = makeConnection(({ complete }) =>
        complete(new Error('boom'), {}),
      );
      const { pool } = makePool(conn);
      const service = new SnowflakeService(pool);

      await expect(service.execute('SELECT 1')).rejects.toThrow('boom');
    });
  });

  describe('executeStream', () => {
    it('yields each row from the streamed result', async () => {
      const conn = {
        execute: ({ complete }: ExecuteOpts) => {
          const stmt = { streamRows: () => Readable.from([{ a: 1 }, { a: 2 }]) };
          complete(null, stmt);
          return stmt;
        },
      } as unknown as Connection;
      const { pool, released } = makePool(conn);
      const service = new SnowflakeService(pool);

      const out: unknown[] = [];
      for await (const row of service.executeStream('SELECT 1')) {
        out.push(row);
      }

      expect(out).toEqual([{ a: 1 }, { a: 2 }]);
      expect(released).toHaveLength(1);
    });

    it('releases the connection even when the stream errors', async () => {
      const conn = {
        execute: ({ complete }: ExecuteOpts) => {
          complete(new Error('stream-fail'), {});
          return { streamRows: () => Readable.from([]) };
        },
      } as unknown as Connection;
      const { pool, released } = makePool(conn);
      const service = new SnowflakeService(pool);

      const iterator = service.executeStream('SELECT 1');
      await expect(iterator.next()).rejects.toThrow('stream-fail');
      expect(released).toHaveLength(1);
    });
  });

  describe('withTransaction', () => {
    it('runs BEGIN, the callback, then COMMIT and returns the result', async () => {
      const statements: string[] = [];
      const conn = makeConnection(({ sqlText, complete }) => {
        statements.push(sqlText);
        complete(null, {}, []);
      });
      const { pool, released } = makePool(conn);
      const service = new SnowflakeService(pool);

      const result = await service.withTransaction(async (tx) => {
        expect(tx).toBeInstanceOf(SnowflakeTransaction);
        await tx.execute('INSERT INTO t VALUES (1)');
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(statements).toEqual([
        'BEGIN',
        'INSERT INTO t VALUES (1)',
        'COMMIT',
      ]);
      expect(released).toHaveLength(1);
    });

    it('runs ROLLBACK and rethrows when the callback fails', async () => {
      const statements: string[] = [];
      const conn = makeConnection(({ sqlText, complete }) => {
        statements.push(sqlText);
        complete(null, {}, []);
      });
      const { pool, released } = makePool(conn);
      const service = new SnowflakeService(pool);

      await expect(
        service.withTransaction(async () => {
          throw new Error('user-fail');
        }),
      ).rejects.toThrow('user-fail');

      expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
      expect(released).toHaveLength(1);
    });
  });

  describe('lifecycle', () => {
    it('drains the pool on application shutdown', async () => {
      const conn = makeConnection(({ complete }) => complete(null, {}, []));
      const drained = jest.fn().mockResolvedValue(undefined);
      const cleared = jest.fn().mockResolvedValue(undefined);
      const pool = {
        use: async () => undefined,
        acquire: async () => conn,
        release: async () => undefined,
        drain: drained,
        clear: cleared,
      } as unknown as Pool<Connection>;
      const service = new SnowflakeService(pool);

      await service.onApplicationShutdown();

      expect(drained).toHaveBeenCalledTimes(1);
      expect(cleared).toHaveBeenCalledTimes(1);
    });
  });
});
