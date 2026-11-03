#!/usr/bin/env python3
"""Exercise MCP approval migration on an isolated temporary PostgreSQL cluster.

Requires local initdb, pg_ctl and psql in PATH. Uses a private Unix socket,
synthetic identifiers and no TCP listener; never reads a DATABASE_URL. This
checks database privileges and one-time consumption, not Gemini or billing E2E.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile

MIGRATION = Path(__file__).resolve().parents[1] / 'supabase/migrations/20261102a_mcp_generation_approvals.sql'
OWNER = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
APPROVAL = '00000000-0000-4000-8000-000000000003'
EXPIRED = '00000000-0000-4000-8000-000000000004'
HASH = 'a' * 64


def run(argv, *, check=True):
    result = subprocess.run(argv, text=True, capture_output=True, check=False)
    if check and result.returncode:
        raise RuntimeError(f'{argv[0]} failed: {result.stderr}')
    return result


def main():
    # A distinct socket directory, rather than a shared /tmp socket, rules out
    # accidentally connecting to an existing database on the same port.
    with tempfile.TemporaryDirectory(prefix='mcp-pg-', dir='/tmp') as tmp:
        root = Path(tmp)
        cluster = root / 'data'
        run(['initdb', '-D', str(cluster), '--auth=trust', '--no-locale', '--encoding=UTF8'])
        started = False
        try:
            run(['pg_ctl', '-D', str(cluster), '-l', str(root / 'server.log'), '-o', f"-h '' -k {root} -p 55497", '-w', 'start'])
            started = True
            psql = ['psql', '-X', '-qAt', '-h', str(root), '-p', '55497', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']

            def sql(statement, *, check=True):
                return run(psql + ['-c', statement], check=check)

            for statement in (
                'create schema auth', 'create role anon', 'create role authenticated',
                'create role service_role bypassrls', 'create table auth.users (id uuid primary key)',
            ):
                sql(statement)
            run(psql + ['-f', str(MIGRATION)])
            sql(f"insert into auth.users values ('{OWNER}'), ('{OTHER}')")
            sql(f"insert into public.mcp_generation_approvals (id,user_id,client_id,request,request_hash,quoted_credits,state) values ('{APPROVAL}','{OWNER}','client-a','{{\"kind\":\"audio\"}}','{HASH}',7,'approved')")
            sql(f"insert into public.mcp_generation_approvals (id,user_id,client_id,request,request_hash,quoted_credits,state,expires_at) values ('{EXPIRED}','{OWNER}','client-a','{{\"kind\":\"audio\"}}','{HASH}',7,'approved',now()-interval '1 second')")

            for role in ('anon', 'authenticated'):
                result = sql(f'SET ROLE {role}; select * from public.mcp_generation_approvals', check=False)
                assert result.returncode and 'permission denied' in result.stderr, role

            def claim(approval, owner, client, digest):
                statement = ("set role service_role; update public.mcp_generation_approvals "
                    "set state='consumed', consumed_at=now() "
                    f"where id='{approval}' and user_id='{owner}' and client_id='{client}' "
                    f"and request_hash='{digest}' and state='approved' and expires_at>now() returning id")
                return sql(statement).stdout.strip()

            assert not claim(APPROVAL, OTHER, 'client-a', HASH)
            assert not claim(APPROVAL, OWNER, 'client-b', HASH)
            assert not claim(APPROVAL, OWNER, 'client-a', 'b' * 64)
            assert not claim(EXPIRED, OWNER, 'client-a', HASH)
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(lambda _: claim(APPROVAL, OWNER, 'client-a', HASH), range(8)))
            assert results.count(APPROVAL) == 1 and sum(bool(result) for result in results) == 1
            assert not claim(APPROVAL, OWNER, 'client-a', HASH)
            print('PASS: migration, role denial, ownership, client, hash, expiry, concurrent one-time claim and replay')
        finally:
            if started:
                run(['pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__':
    main()
