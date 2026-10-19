/**
 * Embedded better-sqlite3 compatible synchronous engine powered by Node's native C++ SQLite (node:sqlite).
 * Provides zero-latency, offline-first ACID persistence with WAL journaling.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export class Statement<BindParameters extends unknown[] = unknown[], Result = Record<string, unknown>> {
  private stmt: ReturnType<DatabaseSync['prepare']>;

  constructor(stmt: ReturnType<DatabaseSync['prepare']>) {
    this.stmt = stmt;
  }

  run(...params: BindParameters): RunResult {
    const res = this.stmt.run(...(params as any[]));
    return {
      changes: Number(res.changes),
      lastInsertRowid: Number(res.lastInsertRowid),
    };
  }

  get(...params: BindParameters): Result | undefined {
    return this.stmt.get(...(params as any[])) as Result | undefined;
  }

  all(...params: BindParameters): Result[] {
    return this.stmt.all(...(params as any[])) as Result[];
  }
}

export default class Database {
  private db: DatabaseSync;
  public readonly name: string;

  constructor(filename: string) {
    const dir = path.dirname(filename);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.name = filename;
    this.db = new DatabaseSync(filename);
  }

  pragma(pragmaStatement: string): unknown {
    this.db.exec(`PRAGMA ${pragmaStatement}`);
    return true;
  }

  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  prepare<BindParameters extends unknown[] = unknown[], Result = Record<string, unknown>>(
    sql: string
  ): Statement<BindParameters, Result> {
    return new Statement<BindParameters, Result>(this.db.prepare(sql));
  }

  transaction<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close(): this {
    this.db.close();
    return this;
  }
}
