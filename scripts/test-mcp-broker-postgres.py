#!/usr/bin/env python3
"""Test the unexposed OAuth broker SQL proposal on a disposable local DB.

Uses only a temporary Unix socket, synthetic data and no TCP listener. Requires
initdb, pg_ctl and psql in PATH. Never reads a production connection string.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(args):
    result = subprocess.run(args, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr}')
    return result


def main():
    with tempfile.TemporaryDirectory(prefix='mcp-broker-', dir='/tmp') as directory:
        root = Path(directory)
        cluster = root / 'data'
        run(['initdb', '-D', str(cluster), '--auth=trust', '--no-locale', '--encoding=UTF8'])
        started = False
        try:
            run(['pg_ctl', '-D', str(cluster), '-l', str(root / 'server.log'), '-o', f"-h '' -k {root} -p 55496", '-w', 'start'])
            started = True
            psql = ['psql', '-X', '-qAt', '-h', str(root), '-p', '55496', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
            for sql in ('create schema auth', 'create role anon', 'create role authenticated',
                        'create role service_role bypassrls', 'create table auth.users (id uuid primary key)'):
                run(psql + ['-c', sql])
            run(psql + ['-f', str(ROOT / 'docs/handoffs/mcp/proposals/oauth-broker.sql')])
            run(psql + ['-f', str(ROOT / 'tests/sql/mcp-oauth-broker.sql')])
            user = '00000000-0000-4000-8000-000000000001'
            grant = '00000000-0000-4000-8000-000000000002'
            run(psql + ['-c', f"insert into auth.users values ('{user}')"])
            run(psql + ['-c', "insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext) "
                f"values ('{grant}','{user}','client','https://example.test/api/mcp/gemini',array['mcp:read'],'ciphertext')"])

            def claim(index):
                claim_id = f'00000000-0000-4000-8000-{index:012d}'
                sql = ("set role service_role; select public.mcp_oauth_claim_upstream_refresh("
                       f"'{grant}','{user}','client','https://example.test/api/mcp/gemini','{claim_id}')")
                return run(psql + ['-c', sql]).stdout.strip()

            with ThreadPoolExecutor(max_workers=8) as pool:
                claims = list(pool.map(claim, range(10, 18)))
            if claims.count('ciphertext') != 1 or sum(bool(value) for value in claims) != 1:
                raise RuntimeError('concurrent upstream refresh was claimed more than once')

            def begin(index):
                pending = f'10000000-0000-4000-8000-{index:012d}'
                sql = ("set role service_role; select public.mcp_oauth_begin_pending("
                       f"'{pending}','{user}','client','https://client.test/cb','https://example.test/api/mcp/gemini',"
                       "array['mcp:read'],repeat('c',43),'state')")
                return run(psql + ['-c', sql]).stdout.strip()

            with ThreadPoolExecutor(max_workers=20) as pool:
                requests = list(pool.map(begin, range(1, 21)))
            if requests.count('t') != 10 or requests.count('f') != 10:
                raise RuntimeError('concurrent pending authorization limit failed')
            print('PASS: isolated OAuth broker SQL proposal, concurrent refresh claim and authorization limit')
        finally:
            if started:
                run(['pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__':
    main()
