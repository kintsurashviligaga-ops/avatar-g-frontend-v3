#!/usr/bin/env python3
"""Test the targeted TRUNCATE revoke on a fresh isolated Postgres cluster.

Synthetic rows only, a private Unix socket, no TCP listener or DATABASE_URL.
This is not a test of PostgREST exposure or production permissions.
"""
from pathlib import Path
import subprocess
import tempfile

MIGRATION = Path(__file__).resolve().parents[1] / 'supabase/migrations/20261103a_generation_jobs_client_truncate.sql'


def run(args, check=True):
    result = subprocess.run(args, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr}')
    return result


def main():
    with tempfile.TemporaryDirectory(prefix='mcp-truncate-pg-', dir='/tmp') as tmp:
        data = Path(tmp) / 'data'
        run(['initdb', '-D', str(data), '--auth=trust', '--no-locale', '--encoding=UTF8'])
        started = False
        try:
            run(['pg_ctl', '-D', str(data), '-l', str(Path(tmp) / 'log'), '-o', f"-h '' -k {tmp} -p 55499", '-w', 'start'])
            started = True
            psql = ['psql', '-X', '-qAt', '-h', tmp, '-p', '55499', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
            def sql(statement, check=True): return run(psql + ['-c', statement], check)
            sql('''create role anon; create role authenticated; create role service_role;
              create role inherited_client; create table public.generation_jobs(id int);
              alter table public.generation_jobs enable row level security;
              grant select, delete, truncate on public.generation_jobs to anon, authenticated;
              grant truncate on public.generation_jobs to service_role;
              insert into public.generation_jobs values (1);''')
            # Even with RLS on and no policies, TRUNCATE is outside RLS.
            sql('set role anon; truncate public.generation_jobs')
            sql('insert into public.generation_jobs values (1)')
            # Inherited privilege causes atomic failure rather than a false-safe migration.
            sql('grant inherited_client to anon; grant truncate on public.generation_jobs to inherited_client')
            failed = run(psql + ['-f', str(MIGRATION)], False)
            assert failed.returncode and 'client still has inherited' in failed.stderr
            assert sql("select has_table_privilege('authenticated','public.generation_jobs','TRUNCATE')").stdout.strip() == 't'
            sql('revoke inherited_client from anon')
            run(psql + ['-f', str(MIGRATION)])
            run(psql + ['-f', str(MIGRATION)])  # idempotent
            for role in ('anon', 'authenticated'):
                assert sql(f"select has_table_privilege('{role}','public.generation_jobs','TRUNCATE')").stdout.strip() == 'f'
                assert sql(f'set role {role}; truncate public.generation_jobs', False).returncode
                assert sql(f"select has_table_privilege('{role}','public.generation_jobs','DELETE')").stdout.strip() == 't'
            assert sql("select has_table_privilege('service_role','public.generation_jobs','TRUNCATE')").stdout.strip() == 't'
            assert sql('select count(*) from public.generation_jobs').stdout.strip() == '1'
            print('PASS: synthetic RLS/TRUNCATE behavior, inherited-grant rollback, revoke, role preservation, idempotence')
        finally:
            if started: run(['pg_ctl', '-D', str(data), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__': main()
