#!/usr/bin/env python3
"""Test the video transaction *prototype* in a fresh local Postgres only.

This never uses DATABASE_URL or a TCP listener. It proves neither live schema
compatibility nor a working renderer, policy, retry, or refund path.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
USER = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
HASH = 'a' * 64


def run(argv, check=True):
    p = subprocess.run(argv, text=True, capture_output=True)
    if check and p.returncode:
        raise RuntimeError(f'{argv[0]} failed: {p.stderr}')
    return p


def main():
    with tempfile.TemporaryDirectory(prefix='mcp-video-pg-', dir='/tmp') as tmp:
        data = Path(tmp) / 'data'
        run(['initdb', '-D', str(data), '--auth=trust', '--no-locale', '--encoding=UTF8'])
        started = False
        try:
            run(['pg_ctl', '-D', str(data), '-l', str(Path(tmp) / 'log'), '-o', f"-h '' -k {tmp} -p 55498", '-w', 'start'])
            started = True
            cmd = ['psql', '-X', '-qAt', '-h', tmp, '-p', '55498', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
            def sql(s, check=True): return run(cmd + ['-c', s], check)
            sql("""create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
              create table auth.users(id uuid primary key);
              create table public.profiles(id uuid primary key, credits_balance integer not null);
              create table public.credit_ledger(user_id uuid not null, delta integer not null, reason text not null, metadata jsonb not null);
              create unique index ledger_ref on public.credit_ledger(user_id, (metadata->>'ref')) where delta < 0;
              create function public.fixture_balance() returns trigger language plpgsql as $$ begin
                update public.profiles set credits_balance=credits_balance+new.delta where id=new.user_id; return new; end $$;
              create trigger fixture_balance after insert on public.credit_ledger for each row execute function public.fixture_balance();""")
            run(cmd + ['-f', str(ROOT / 'supabase/migrations/20261102a_mcp_generation_approvals.sql')])
            migration = (ROOT / 'supabase/migrations/20261002d_ledger_ref_race_hardening.sql').read_text()
            start = migration.index('CREATE OR REPLACE FUNCTION public.deduct_credits_once(')
            end = migration.index('$function$;', start) + len('$function$;')
            sql(migration[start:end])
            run(cmd + ['-f', str(ROOT / 'docs/handoffs/mcp/proposals/video-transaction.sql')])
            sql(f"insert into auth.users values ('{USER}'),('{OTHER}'); insert into public.profiles values ('{USER}',20),('{OTHER}',20)")
            def aid(n): return f'00000000-0000-4000-8000-{n:012d}'
            def approval(n, cost=7, state='approved', expiry="now()+interval '1 hour'", kind='video'):
                sql(f"insert into public.mcp_generation_approvals (id,user_id,client_id,request,request_hash,quoted_credits,state,expires_at) values ('{aid(n)}','{USER}','client-a','{{\"kind\":\"{kind}\"}}','{HASH}',{cost},'{state}',{expiry})")
            def call(n, user=USER, client='client-a', digest=HASH, check=True):
                return sql(f"set role service_role; select public.mcp_video_enqueue_prototype('{aid(n)}','{user}','{client}','{digest}')", check)
            approval(10)
            for args in ({'user': OTHER}, {'client': 'client-b'}, {'digest': 'b'*64}):
                assert call(10, check=False, **args).returncode
            for n, kw in [(11, {'state':'pending'}), (12, {'expiry':"now()-interval '1 second'"}), (13, {'kind':'audio'}), (14, {'cost':0})]:
                approval(n, **kw)
                assert call(n, check=False).returncode
            for role in ('anon', 'authenticated'):
                assert sql(f"set role {role}; select public.mcp_video_enqueue_prototype('{aid(10)}','{USER}','client-a','{HASH}')", False).returncode
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(lambda _: call(10).stdout.strip(), range(8)))
            assert results == [aid(10)] * 8
            assert sql(f"select credits_balance from public.profiles where id='{USER}'").stdout.strip() == '13'
            assert sql('select count(*) from public.credit_ledger').stdout.strip() == '1'
            assert sql('select count(*) from public.mcp_video_jobs_prototype').stdout.strip() == '1'
            approval(15, cost=14)
            assert call(15, check=False).returncode
            assert sql(f"select state from public.mcp_generation_approvals where id='{aid(15)}'").stdout.strip() == 'approved'
            # Force the queue insertion to fail *after* the debit; transaction must roll back.
            approval(16)
            sql("alter table public.mcp_video_jobs_prototype add constraint fixture_failure check (false) not valid")
            assert call(16, check=False).returncode
            assert sql(f"select credits_balance from public.profiles where id='{USER}'").stdout.strip() == '13'
            assert sql('select count(*) from public.credit_ledger').stdout.strip() == '1'
            assert sql(f"select state from public.mcp_generation_approvals where id='{aid(16)}'").stdout.strip() == 'approved'
            sql('alter table public.mcp_video_jobs_prototype drop constraint fixture_failure')
            approval(17, cost=8)
            approval(18, cost=8)
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda n: call(n, check=False).returncode, (17, 18)))
            assert results.count(0) == 1
            assert sql(f"select credits_balance from public.profiles where id='{USER}'").stdout.strip() == '5'
            assert sql('select count(*) from public.credit_ledger').stdout.strip() == '2'
            assert sql('select count(*) from public.mcp_video_jobs_prototype').stdout.strip() == '2'
            print('PASS: isolated prototype: identity, consent, expiry, role, concurrent replay and competing debits, insufficient funds, rollback')
        finally:
            if started: run(['pg_ctl', '-D', str(data), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__': main()
