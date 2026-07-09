import { SQL } from 'bun';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const migrationsDir = join(import.meta.dir, '..', 'db', 'migrations');

export async function runMigrations(databaseUrl = process.env.DATABASE_URL): Promise<void> {
    if (!databaseUrl) throw new Error('DATABASE_URL is required to run migrations');

    const sql = new SQL(databaseUrl);
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        `;

        const filenames = (await readdir(migrationsDir))
            .filter(filename => filename.endsWith('.sql'))
            .sort();

        for (const filename of filenames) {
            const appliedRows = await sql<{ filename: string }[]>`
                SELECT filename FROM schema_migrations WHERE filename = ${filename}
            `;
            if (appliedRows.length > 0) continue;

            const migrationSql = await Bun.file(join(migrationsDir, filename)).text();
            await sql.begin(async tx => {
                await tx.unsafe(migrationSql);
                await tx`INSERT INTO schema_migrations (filename) VALUES (${filename})`;
            });
        }
    } finally {
        await sql.close();
    }
}

if (import.meta.main) {
    await runMigrations();
}
