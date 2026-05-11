# @shaunak/nestjs-snowflake

Lightweight, production-grade [NestJS](https://nestjs.com/) wrapper around the official [`snowflake-sdk`](https://www.npmjs.com/package/snowflake-sdk).

- Connection pooling out of the box (via `snowflake-sdk`'s built-in pool)
- Promise-based `execute` returning typed rows
- `AsyncIterable` streaming for large result sets
- First-class transaction helper (`BEGIN` / `COMMIT` / `ROLLBACK`)
- Raw connection / pool escape hatch when you need the full SDK surface
- Standard NestJS `forRoot` / `forRootAsync` configuration
- Drains the pool on application shutdown

## Installation

```bash
npm install @shaunak/nestjs-snowflake snowflake-sdk
```

Peer dependencies: `@nestjs/common`, `@nestjs/core`, `reflect-metadata`, `rxjs`, `snowflake-sdk`.

## Quick start

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { SnowflakeModule } from '@shaunak/nestjs-snowflake';

@Module({
  imports: [
    SnowflakeModule.forRoot({
      connection: {
        account: process.env.SF_ACCOUNT!,
        username: process.env.SF_USER!,
        password: process.env.SF_PASSWORD!,
        warehouse: process.env.SF_WAREHOUSE,
        database: process.env.SF_DATABASE,
        schema: process.env.SF_SCHEMA,
        role: process.env.SF_ROLE,
      },
      pool: { min: 1, max: 10 },
    }),
  ],
})
export class AppModule {}
```

```ts
// users.service.ts
import { Injectable } from '@nestjs/common';
import { SnowflakeService } from '@shaunak/nestjs-snowflake';

interface UserRow {
  ID: number;
  EMAIL: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly snowflake: SnowflakeService) {}

  findByEmail(email: string) {
    return this.snowflake.execute<UserRow>(
      'SELECT id, email FROM users WHERE email = ?',
      [email],
    );
  }
}
```

## Async configuration

```ts
SnowflakeModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    connection: {
      account: config.get('SF_ACCOUNT'),
      username: config.get('SF_USER'),
      password: config.get('SF_PASSWORD'),
    },
    pool: { min: 1, max: config.get<number>('SF_POOL_MAX') ?? 10 },
  }),
});
```

`useClass` and `useExisting` are also supported via the `SnowflakeModuleOptionsFactory` interface.

## Streaming large result sets

`executeStream` checks out a connection for the lifetime of the iteration and releases it automatically once the iterator is fully consumed (or errors).

```ts
for await (const row of this.snowflake.executeStream<EventRow>(
  'SELECT * FROM events WHERE day = ?',
  ['2026-05-11'],
)) {
  await sink.write(row);
}
```

## Transactions

`withTransaction` pins a single connection across `BEGIN`, your callback, and `COMMIT`. Throwing inside the callback triggers `ROLLBACK` and re-raises.

```ts
await this.snowflake.withTransaction(async (tx) => {
  await tx.execute('INSERT INTO orders (id, total) VALUES (?, ?)', [id, total]);
  await tx.execute('UPDATE inventory SET qty = qty - ? WHERE sku = ?', [
    qty,
    sku,
  ]);
});
```

## Escape hatch

Drop down to the raw SDK when you need something this wrapper doesn't expose:

```ts
const conn = await this.snowflake.getConnection();
try {
  // ... use snowflake-sdk's Connection directly
} finally {
  await this.snowflake.release(conn);
}

// Or grab the pool itself:
const pool = this.snowflake.getPool();
```

## Module options

| Option            | Type                  | Description                                                                       |
| ----------------- | --------------------- | --------------------------------------------------------------------------------- |
| `connection`      | `ConnectionOptions`   | Passed verbatim to `snowflake-sdk` (account, username, password, key-pair, etc.). |
| `pool`            | `SnowflakePoolOptions` | `{ min, max, idleTimeoutMillis, ... }` forwarded to the underlying pool.         |
| `isGlobal`        | `boolean`             | When `true`, registers the module globally. Default `false`.                      |

## Versioning & compatibility

- Targets Node.js >= 18.
- Targets the current major of `snowflake-sdk` (>= 1.10) and NestJS (>= 10).
- The public surface is restricted to what is re-exported from the package root. Anything imported from a deep path (`@shaunak/nestjs-snowflake/dist/...`) is internal and may change without a major bump.

## License

Apache-2.0
