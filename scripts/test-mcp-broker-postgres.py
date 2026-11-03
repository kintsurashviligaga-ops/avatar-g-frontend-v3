#!/usr/bin/env python3
"""Test the unexposed OAuth broker SQL proposal on a disposable local DB.

Uses only a temporary Unix socket, synthetic data and no TCP listener. Requires
initdb, pg_ctl and psql in PATH. Never reads a production connection string.
"""
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
            print('PASS: isolated OAuth broker SQL proposal')
        finally:
            if started:
                run(['pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__':
    main()
