#!/usr/bin/env python3
"""Test the unexposed OAuth broker SQL proposal on a disposable local DB.

Uses only a temporary Unix socket, synthetic data and no TCP listener. Requires
initdb, pg_ctl and psql in PATH and the pre-revocation commit in Git history.
Never reads a production connection string.
"""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
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
            run(psql + ['-f', str(ROOT / 'docs/handoffs/mcp/proposals/oauth-denial-staging-update.sql')])
            run(psql + ['-f', str(ROOT / 'tests/sql/mcp-oauth-broker.sql')])
            run(psql + ['-f', str(ROOT / 'tests/sql/mcp-logout-state.sql')])

            # Exercise the additive staging upgrade against the last committed
            # pre-change broker schema, separately from a fresh installation.
            run(psql + ['-c', 'create database mcp_upgrade'])
            upgrade_psql = ['psql', '-X', '-qAt', '-h', str(root), '-p', '55496', '-d', 'mcp_upgrade', '-v', 'ON_ERROR_STOP=1']
            run(upgrade_psql + ['-c', 'create schema auth; create table auth.users (id uuid primary key)'])
            baseline = run(['git', '-C', str(ROOT), 'show', '71adeef:docs/handoffs/mcp/proposals/oauth-broker.sql']).stdout
            baseline_path = root / 'pre-revocation-broker.sql'
            baseline_path.write_text(baseline, encoding='utf8')
            run(upgrade_psql + ['-f', str(baseline_path)])
            upgrade_file = str(ROOT / 'docs/handoffs/mcp/proposals/oauth-revoke-state-staging-update.sql')
            initial_access_file = str(ROOT / 'docs/handoffs/mcp/proposals/oauth-initial-access-staging-update.sql')
            run(upgrade_psql + ['-c', "insert into auth.users values ('00000000-0000-4000-8000-000000000001'); "
                "insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id) "
                "values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',"
                "'client','https://example.test/api/mcp/gemini',array['mcp:read'],'ciphertext','00000000-0000-4000-8000-000000000040')"])
            guarded = subprocess.run(upgrade_psql + ['-f', upgrade_file], text=True, capture_output=True, check=False)
            if guarded.returncode == 0:
                raise RuntimeError('staging upgrade accepted an existing grant')
            access_guarded = subprocess.run(upgrade_psql + ['-f', initial_access_file], text=True, capture_output=True, check=False)
            if access_guarded.returncode == 0:
                raise RuntimeError('initial access upgrade accepted an existing grant')
            no_column = run(upgrade_psql + ['-c', "select count(*) from information_schema.columns where table_schema='public' "
                "and table_name='mcp_oauth_grants' and column_name='upstream_logout_state'"]).stdout.strip()
            if no_column != '0':
                raise RuntimeError('failed staging upgrade did not roll back')
            run(upgrade_psql + ['-c', 'delete from public.mcp_oauth_grants'])
            run(upgrade_psql + ['-f', upgrade_file])
            perms = run(upgrade_psql + ['-c', "select has_function_privilege('service_role', "
                "'public.mcp_oauth_complete_upstream_refresh(uuid,uuid,text,text,uuid,text,text,timestamptz)','execute'), "
                "has_function_privilege('service_role', "
                "'public.mcp_oauth_complete_upstream_refresh_v2(uuid,uuid,text,text,uuid,text,text,timestamptz,uuid)','execute'), "
                "has_function_privilege('authenticated', "
                "'public.mcp_oauth_complete_upstream_refresh_v2(uuid,uuid,text,text,uuid,text,text,timestamptz,uuid)','execute')"]).stdout.strip()
            if perms != 'f|t|f':
                raise RuntimeError('staging upgrade function privileges are incorrect')
            run(upgrade_psql + ['-f', initial_access_file])
            finalize_perms = run(upgrade_psql + ['-c', "select has_function_privilege('service_role', "
                "'public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid)','execute'), "
                "has_function_privilege('service_role', "
                "'public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid,text,timestamptz)','execute'), "
                "has_function_privilege('anon', "
                "'public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid,text,timestamptz)','execute')"]).stdout.strip()
            if finalize_perms != 'f|t|f':
                raise RuntimeError('staging initial access upgrade function privileges are incorrect')
            run(upgrade_psql + ['-c', 'delete from auth.users'])
            run(upgrade_psql + ['-f', str(ROOT / 'tests/sql/mcp-oauth-broker.sql')])
            run(upgrade_psql + ['-f', str(ROOT / 'tests/sql/mcp-logout-state.sql')])
            user = '00000000-0000-4000-8000-000000000001'
            grant = '00000000-0000-4000-8000-000000000002'
            run(psql + ['-c', f"insert into auth.users values ('{user}')"])
            run(psql + ['-c', "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$"])
            run(psql + ['-c', 'grant usage on schema auth to authenticated'])
            fixture = str(ROOT / 'docs/handoffs/mcp/proposals/gemini-readonly-preview-fixture.sql')
            bad_guard = subprocess.run(psql + ['-c', "set mcp.preview_project_ref='wrong'", '-f', fixture], text=True, capture_output=True, check=False)
            if bad_guard.returncode == 0:
                raise RuntimeError('preview fixture accepted a wrong project attestation')
            fixture_settings = ("set mcp.preview_project_ref='lejrrdeffeswrdzjqthm'; "
                f"set mcp.synthetic_user_id='{user}'; "
                "set mcp.preview_asset_url='https://lejrrdeffeswrdzjqthm.supabase.co/storage/v1/object/public/renders/mcp-preview/test.png'")
            run(psql + ['-c', fixture_settings, '-f', fixture, '-f', str(ROOT / 'tests/sql/mcp-preview-readonly.sql')])
            duplicate = subprocess.run(psql + ['-c', fixture_settings, '-f', fixture], text=True, capture_output=True, check=False)
            if duplicate.returncode == 0:
                raise RuntimeError('preview fixture accepted an existing generation_jobs table')
            run(psql + ['-c', "insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id) "
                f"values ('{grant}','{user}','client','https://example.test/api/mcp/gemini',array['mcp:read'],'ciphertext','00000000-0000-4000-8000-000000000040')"])

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
            race_user = '00000000-0000-4000-8000-000000000008'
            race_id = '10000000-0000-4000-8000-000000000099'
            run(psql + ['-c', f"insert into auth.users values ('{race_user}')"])
            run(psql + ['-c', "set role service_role; select public.mcp_oauth_begin_pending("
                f"'{race_id}','{race_user}','client','https://client.test/cb','https://example.test/api/mcp/gemini',"
                "array['mcp:read'],repeat('c',43),'race-state')"])
            def decide(approve):
                params = f"'{race_id}','{race_user}'"
                call = (f"public.mcp_oauth_decide_pending({params},true)" if approve else
                    f"oauth_state from public.mcp_oauth_deny_pending({params},'client','https://client.test/cb','https://example.test/api/mcp/gemini')")
                return run(psql + ['-c', f'set role service_role; select {call}']).stdout.strip()
            with ThreadPoolExecutor(max_workers=2) as pool:
                approval, denial = list(pool.map(decide, [True, False]))
            if not ((approval == 't' and denial == '') or (approval == 'f' and denial == 'race-state')):
                raise RuntimeError('approval and denial were not mutually exclusive')

            # Revoke and an already-claimed refresh may complete in either order.
            # Every outcome must remain revoked with its encrypted result queued.
            def race_values(index):
                suffix = f'{index:012d}'
                return (f'60000000-0000-4000-8000-{suffix}', f'70000000-0000-4000-8000-{suffix}',
                        f'80000000-0000-4000-8000-{suffix}', sha256(f'synthetic-{index}'.encode()).hexdigest())
            for index in range(1, 9):
                race_grant, session, claim_id, token_hash = race_values(index)
                run(psql+['-c', "insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_session_id,upstream_refresh_ciphertext) "
                    f"values('{race_grant}','{user}','client','https://example.test/api/mcp/gemini',array['mcp:read'],'{session}','encrypted-old'); "
                    f"insert into public.mcp_oauth_tokens(token_hash,grant_id,kind,expires_at) values('{token_hash}','{race_grant}','access',clock_timestamp()+interval '1 hour'); "
                    f"select public.mcp_oauth_claim_upstream_refresh('{race_grant}','{user}','client','https://example.test/api/mcp/gemini','{claim_id}')"])
            def revoke_or_complete(item):
                index, revoke = item
                race_grant, session, claim_id, token_hash = race_values(index)
                if revoke:
                    call = f"public.mcp_oauth_revoke_token('{token_hash}','client','https://example.test/api/mcp/gemini')"
                else:
                    call = (f"public.mcp_oauth_complete_upstream_refresh_v2('{race_grant}','{user}','client','https://example.test/api/mcp/gemini',"
                            f"'{claim_id}','encrypted-new-access','encrypted-new-refresh',clock_timestamp()+interval '10 minutes','{session}')")
                return run(psql+['-c', f'set role service_role; select {call}']).stdout.strip()
            with ThreadPoolExecutor(max_workers=16) as pool:
                results = list(pool.map(revoke_or_complete, [(i, flag) for i in range(1, 9) for flag in (True, False)]))
            if any(value != 't' for value in results):
                raise RuntimeError('concurrent revoke or in-flight refresh failed')
            status = run(psql+['-c', "select count(*) from public.mcp_oauth_grants where id::text like '60000000-%' "
                "and revoked_at is not null and upstream_logout_state='queued' and upstream_access_ciphertext='encrypted-new-access'"]).stdout.strip()
            if status != '8':
                raise RuntimeError('concurrent revoke/refresh did not preserve all revoked encrypted results')
            first, _, _, _ = race_values(1)
            def logout_claim(index):
                claim_id = f'90000000-0000-4000-8000-{index:012d}'
                return run(psql+['-c', f"set role service_role; select access_ciphertext from public.mcp_oauth_claim_logout('{first}','{claim_id}')"]).stdout.strip()
            with ThreadPoolExecutor(max_workers=8) as pool:
                claims = list(pool.map(logout_claim, range(1, 9)))
            if claims.count('encrypted-new-access') != 1 or sum(bool(value) for value in claims) != 1:
                raise RuntimeError('logout task claimed more than once')
            print('PASS: isolated broker, RLS, authorization, refresh/revoke and logout-claim concurrency')
        finally:
            if started:
                run(['pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop'])


if __name__ == '__main__':
    main()
