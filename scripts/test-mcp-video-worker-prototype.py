#!/usr/bin/env python3
"""Exercise an isolated worker state prototype; never connects to live data.

This does not run a real worker, provider, refund, or production schema.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
JOB = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
USER = '00000000-0000-4000-8000-000000000003'
HASH = 'a' * 64


def run(argv, check=True):
    result = subprocess.run(argv, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f'{argv[0]} failed: {result.stderr}')
    return result


def main():
    with tempfile.TemporaryDirectory(prefix='mcp-video-worker-pg-', dir='/tmp') as tmp:
        data = Path(tmp) / 'data'
        run(['initdb', '-D', str(data), '--auth=trust', '--no-locale', '--encoding=UTF8'])
        started = False
        try:
            run(['pg_ctl', '-D', str(data), '-l', str(Path(tmp) / 'log'), '-o', f"-h '' -k {tmp} -p 55497", '-w', 'start'])
            started = True
            cmd = ['psql', '-X', '-qAt', '-h', tmp, '-p', '55497', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
            def sql(statement, check=True): return run(cmd + ['-c', statement], check)
            sql('''create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
              create table auth.users(id uuid primary key);
              create table public.profiles(id uuid primary key, credits_balance integer not null);
              create table public.credit_ledger(user_id uuid not null, delta integer not null, reason text not null, metadata jsonb not null);
              create unique index ledger_ref on public.credit_ledger(user_id, (metadata->>'ref')) where delta < 0;
              create function public.fixture_balance() returns trigger language plpgsql as $$ begin
                update public.profiles set credits_balance=credits_balance+new.delta where id=new.user_id; return new; end $$;
              create trigger fixture_balance after insert on public.credit_ledger for each row execute function public.fixture_balance();''')
            run(cmd + ['-f', str(ROOT / 'supabase/migrations/20261102a_mcp_generation_approvals.sql')])
            migration = (ROOT / 'supabase/migrations/20261002d_ledger_ref_race_hardening.sql').read_text()
            start = migration.index('CREATE OR REPLACE FUNCTION public.deduct_credits_once(')
            end = migration.index('$function$;', start) + len('$function$;')
            sql(migration[start:end])
            run(cmd + ['-f', str(ROOT / 'docs/handoffs/mcp/proposals/video-transaction.sql')])
            run(cmd + ['-f', str(ROOT / 'docs/handoffs/mcp/proposals/video-worker-state-prototype.sql')])
            sql(f"insert into auth.users values ('{USER}'); insert into public.profiles values ('{USER}',20)")
            for job in (JOB, OTHER):
                sql(f"insert into public.mcp_generation_approvals (id,user_id,client_id,request,request_hash,quoted_credits,state,expires_at) values ('{job}','{USER}','client-a','{{\"kind\":\"video\"}}','{HASH}',7,'approved',now()+interval '1 hour')")
                sql(f"set role service_role; select public.mcp_video_enqueue_prototype('{job}','{USER}','client-a','{HASH}')")
            assert sql(f"select credits_balance from public.profiles where id='{USER}'").stdout.strip() == '6'
            assert sql('select count(*) from public.credit_ledger').stdout.strip() == '2'
            lease = lambda n: f'00000000-0000-4000-8001-{n:012d}'
            def call(name, job, token, rest='', check=True):
                return sql(f"set role service_role; select public.mcp_video_{name}_prototype('{job}','{token}'{rest})", check).stdout.strip()
            for role in ('anon','authenticated'):
                assert sql(f"set role {role}; select public.mcp_video_claim_prototype('{JOB}','{lease(1)}')",False).returncode
            with ThreadPoolExecutor(max_workers=12) as pool:
                claims = list(pool.map(lambda n: call('claim', JOB, lease(n)), range(1,13)))
            assert claims.count('t') == 1 and claims.count('f') == 11
            winning = lease(claims.index('t')+1)
            wrong = lease(13)
            assert call('begin_submit',JOB,wrong) == 'f'
            sql(f"update public.mcp_video_jobs_prototype set lease_until=clock_timestamp()-interval '1 second' where approval_id='{JOB}'")
            assert call('begin_submit',JOB,winning) == 'f'
            assert call('claim',JOB,wrong) == 't'
            assert call('begin_submit',JOB,winning) == 'f'
            assert call('begin_submit',JOB,wrong) == 't'
            # A crash or timeout after begin is ambiguous: even an expired lease
            # must never cause a second submission.
            assert call('claim',JOB,lease(14)) == 'f'
            assert call('begin_submit',JOB,wrong) == 'f'
            assert call('record_submit',JOB,winning,",'operation-old'") == 'f'
            assert call('record_submit',JOB,wrong,",'operation-1'") == 't'
            assert call('record_submit',JOB,wrong,",'operation-2'") == 'f'
            assert call('claim',JOB,lease(15)) == 'f'
            assert sql(f"select state||':'||provider_operation from public.mcp_video_jobs_prototype where approval_id='{JOB}'").stdout.strip() == 'submitted:operation-1'
            assert call('claim',OTHER,winning) == 't'
            assert call('begin_submit',OTHER,winning) == 't'
            assert call('uncertain_submit',OTHER,winning) == 't'
            assert call('claim',OTHER,wrong) == 'f'
            assert call('record_submit',OTHER,winning,",'operation-late'") == 'f'
            assert sql(f"select state from public.mcp_video_jobs_prototype where approval_id='{OTHER}'").stdout.strip() == 'uncertain'
            assert sql('select count(*) from public.credit_ledger').stdout.strip() == '2'
            print('PASS: synthetic debit/queue and worker state: role denial, 12-way claim, lease expiry, stale workers, ambiguous submit and no retry')
        finally:
            if started:
                run(['pg_ctl', '-D', str(data), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__': main()
