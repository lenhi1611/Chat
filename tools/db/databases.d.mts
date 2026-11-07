export type DbName = 'auth' | 'chat';

export declare const DATABASES: Record<
  DbName,
  { envVar: string; testDatabase: string }
>;
export declare function prismaConfigPath(name: DbName): string;
export declare function devDatabaseUrl(name: DbName): string;
export declare function testDatabaseUrl(name: DbName): string;
export declare function ensureDatabaseExists(url: string): Promise<void>;
export declare function prisma(name: DbName, args: string[], url: string): void;
export declare function ensureTestDatabase(name: DbName): Promise<string>;
