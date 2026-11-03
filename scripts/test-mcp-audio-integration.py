#!/usr/bin/env python3
"""Run the MCP audio component integration in disposable local PostgreSQL.

Requires Node 24, initdb, pg_ctl and psql in PATH. No production connections,
Gemini account or paid provider are used. A temporary socket directory and
disabled TCP listener isolate the synthetic database. The test exercises the
real MCP/consent routes and Music Studio engine, with mocked auth, Supabase JS
transport, lease store and provider, and a synthetic PostgreSQL ledger.
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20261102a_mcp_generation_approvals.sql'


def run(argv, *, env=None):
    result = subprocess.run(argv, text=True, capture_output=True, env=env, check=False)
    if result.returncode:
        raise RuntimeError(f'{argv[0]} failed:\n{result.stdout}\n{result.stderr}')
    return result


def main():
    major = int(run(['node', '--version']).stdout.strip().lstrip('v').split('.')[0])
    if major != 24:
        raise RuntimeError('Node 24 is required; place it first in PATH')
    with tempfile.TemporaryDirectory(prefix='mcp-int-', dir='/tmp') as tmp:
        root = Path(tmp)
        cluster = root / 'data'
        run(['initdb', '-D', str(cluster), '--auth=trust', '--no-locale', '--encoding=UTF8'])
        started = False
        try:
            run(['pg_ctl', '-D', str(cluster), '-l', str(root / 'server.log'), '-o', f"-h '' -k {root} -p 55497", '-w', 'start'])
            started = True
            psql = ['psql', '-X', '-qAt', '-h', str(root), '-p', '55497', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
            for statement in (
                'create schema auth', 'create role anon', 'create role authenticated',
                'create role service_role bypassrls', 'create table auth.users (id uuid primary key)',
                "insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002')",
            ):
                run(psql + ['-c', statement])
            run(psql + ['-f', str(MIGRATION)])
            run(psql + ['-c', '''
              create table public.mcp_test_balances(user_id uuid primary key, credits integer not null);
              create table public.mcp_test_ledger(ref text primary key, credits integer not null);
              insert into public.mcp_test_balances values ('00000000-0000-4000-8000-000000000001', 100);
              create function public.mcp_test_reserve(uid uuid, amount integer, ref text) returns boolean
              language plpgsql as $$ begin
                update public.mcp_test_balances set credits=credits-amount where user_id=uid and credits>=amount;
                if not found then return false; end if;
                insert into public.mcp_test_ledger values (ref, amount);
                return true;
              exception when unique_violation then return false; end $$;
            '''])
            env = {**os.environ, 'MCP_TEST_PGSOCKET': str(root), 'NEXT_TELEMETRY_DISABLED': '1'}
            result = run(['node', 'node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', 'lib/mcp/gemini/audio.integration.pg.test.ts'], env=env)
            print(result.stdout + result.stderr)
        finally:
            if started:
                run(['pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__':
    main()
