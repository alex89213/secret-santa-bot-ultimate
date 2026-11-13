/**
 * Description:  Tests permissions, concurrency, past years and ordering against a real local
 *               PostgreSQL database.
 * Author:       Alex Wu
 * Dependencies: vitest, pg, node:crypto, domain/draw.ts
 * Usage:        npm run test:db
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { generateDraw, type HistoryPair, type Pair } from '@/domain/draw';
const url = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const parsed = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.port !== '54322')
  throw new Error('Database tests require isolated local Supabase on port 54322.');
const db = new Pool({ connectionString: url });
const users = Array.from({ length: 7 }, () => randomUUID());
const dids = users.map((_, i) => `9000000000000000${String(i + 10)}`);
const gids = [randomUUID(), randomUUID()],
  mids: string[] = Array.from({ length: 7 }, () => randomUUID()),
  exchanges: string[] = [];
let owner = users[0];
/** Calls the service-only `ssbu_<operation>(actor, payload)` database function. */
async function cmd<T = unknown>(uid: string, operation: string, payload: unknown = {}): Promise<T> {
  if (!/^[a-z_]+$/.test(operation)) throw new Error('Invalid operation name');
  return (
    await db.query(`select public.ssbu_${operation}($1,$2::jsonb) result`, [
      uid,
      JSON.stringify(payload),
    ])
  ).rows[0].result;
}
/** Finalizes the stored candidate the way the dashboard does, bound to its timestamp. */
async function finalize(uid: string, eid: string) {
  const stamp = (
    await db.query('select created_at::text from ssbu_private.candidates where exchange_id=$1', [
      eid,
    ])
  ).rows[0]?.created_at;
  return (
    await db.query('select public.ssbu_finalize_reviewed_draw($1,$2,$3) result', [
      uid,
      eid,
      stamp ?? null,
    ])
  ).rows[0].result;
}
const chainContext = async (uid: string, eid: string) =>
  (await db.query('select public.ssbu_review_chain($1,$2,null) result', [uid, eid])).rows[0]
    .result as { own_member_id: string | null };
async function createExchange() {
  const result = await cmd<{ id: string }>(owner, 'exchange_create', {
    group_id: gids[0],
    name: 'Test exchange',
    budget: 25,
    currency: 'USD',
    mode: 'minimize',
  });
  exchanges.push(result.id);
  await cmd(owner, 'participants_set', { exchange_id: result.id, members: mids.slice(0, 5) });
  return result.id;
}
async function candidate(eid: string) {
  const ctx = await cmd<{
    participants: string[];
    history: HistoryPair[];
    exchange: { revision: number };
    group_revision: number;
  }>(owner, 'draw_context', { exchange_id: eid });
  const draw = generateDraw(ctx.participants, ctx.history, { mode: 'minimize' });
  await cmd(owner, 'candidate_save', {
    exchange_id: eid,
    pairs: draw.pairs,
    optimal: draw.optimal,
    revision: ctx.exchange.revision,
    group_revision: ctx.group_revision,
  });
  return draw;
}
async function asUser<T>(uid: string, query: string, params: unknown[] = []): Promise<T[]> {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
    return (await c.query(query, params)).rows;
  } finally {
    await c.query('rollback');
    c.release();
  }
}
async function removeExchange(uid: string, eid: string, confirmation = 'Test exchange') {
  return (
    await db.query('select public.ssbu_delete_exchange($1,$2,$3) result', [uid, eid, confirmation])
  ).rows[0].result;
}
beforeAll(async () => {
  expect(
    (await db.query("select to_regprocedure('public.ssbu_context(uuid,jsonb)') as fn")).rows[0].fn,
  ).toBeTruthy();
  if ((await db.query('select count(*)::int n from public.ssbu_instance_roles')).rows[0].n)
    throw new Error(
      'Use a clean isolated database for the atomic first-owner test. No existing data will be removed.',
    );
  for (let i = 0; i < users.length; i++) {
    await db.query(
      "insert into auth.users(id,aud,role,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated','{}',$2)",
      [users[i], JSON.stringify({ provider_id: dids[0], sub: dids[0] })],
    );
    await db.query(
      "insert into auth.identities(id,user_id,provider_id,provider,identity_data) values($1,$2,$3,'discord',$4)",
      [randomUUID(), users[i], dids[i], JSON.stringify({ sub: dids[i] })],
    );
    await cmd(users[i], 'context', { display_name: `Test ${i}` });
  }
});
afterAll(async () => {
  // delete only this test run's records from the isolated local database
  await db.query(
    'delete from public.ssbu_notification_deliveries where exchange_id in (select id from public.ssbu_exchanges where group_id=any($1))',
    [gids],
  );
  await db.query(
    'delete from ssbu_private.history_audit where exchange_id in (select id from public.ssbu_exchanges where group_id=any($1))',
    [gids],
  );
  await db.query(
    'delete from ssbu_private.candidates where exchange_id in (select id from public.ssbu_exchanges where group_id=any($1))',
    [gids],
  );
  await db.query(
    'delete from public.ssbu_draw_reports where exchange_id in (select id from public.ssbu_exchanges where group_id=any($1))',
    [gids],
  );
  for (const t of [
    'ssbu_assignments',
    'ssbu_historical_assignments',
    'ssbu_exchange_participants',
    'ssbu_exchanges',
    'ssbu_group_members',
  ])
    await db.query(`delete from public.${t} where group_id=any($1)`, [gids]);
  await db.query('delete from public.ssbu_groups where id=any($1)', [gids]);
  await db.query('delete from public.ssbu_wishlist_items where discord_id=any($1)', [dids]);
  await db.query('delete from public.ssbu_instance_roles where user_id=any($1)', [users]);
  await db.query('delete from ssbu_private.rate_limits where key=any($1)', [
    users.map((u) => `setup:${u}`),
  ]);
  await db.query('delete from public.ssbu_profiles where id=any($1)', [users]);
  await db.query('delete from auth.identities where user_id=any($1)', [users]);
  await db.query('delete from auth.users where id=any($1)', [users]);
  await db.end();
});
describe('database authorization and transactions', () => {
  it('has the service-only exchange deletion function installed', async () => {
    expect(
      (await db.query("select to_regprocedure('public.ssbu_delete_exchange(uuid,uuid,text)') fn"))
        .rows[0].fn,
    ).toBeTruthy();
  });
  it('claims exactly one owner under concurrent requests and rejects subsequent claims', async () => {
    const results = await Promise.allSettled([
      cmd(users[0], 'claim_owner'),
      cmd(users[1], 'claim_owner'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    owner = results[0].status === 'fulfilled' ? users[0] : users[1];
    await expect(cmd(users[2], 'claim_owner')).rejects.toThrow('already been established');
    for (let j = 0; j < 2; j++)
      await db.query(
        'insert into public.ssbu_groups(id,name,guild_id,created_by) values($1,$2,$3,$4)',
        [gids[j], `Group ${j}`, `8000000000000000${j + 10}`, owner],
      );
    for (let i = 0; i < 7; i++)
      await db.query(
        'insert into public.ssbu_group_members(id,group_id,discord_id,display_name,role) values($1,$2,$3,$4,$5)',
        [mids[i], gids[i < 5 ? 0 : 1], dids[i], `Member ${i}`, i === 0 ? 'admin' : 'member'],
      );
  });
  it('persists setup rate limits across attempts', async () => {
    for (let i = 0; i < 5; i++)
      expect(await cmd(users[2], 'setup_attempt')).toEqual({ allowed: true });
    expect(await cmd(users[2], 'setup_attempt')).toEqual({ allowed: false });
  });
  it('uses protected Discord identities despite forged user metadata and isolates groups', async () => {
    await expect(cmd(users[6], 'group', { group_id: gids[0] })).rejects.toThrow('access denied');
    await expect(cmd(users[2], 'owner_check')).rejects.toThrow('owner access');
    await expect(
      cmd(users[2], 'member_save', {
        group_id: gids[0],
        discord_id: dids[6],
        display_name: 'attack',
        role: 'admin',
      }),
    ).rejects.toThrow('administrator');
    const rows = await asUser<{ id: string }>(users[6], 'select id from public.ssbu_groups');
    expect(rows.map((r) => r.id)).toEqual([gids[1]]);
    await expect(
      asUser(users[2], "select public.ssbu_claim_owner($1,'{}')", [users[2]]),
    ).rejects.toThrow('permission denied');
    await expect(asUser(users[2], 'select * from ssbu_private.candidates')).rejects.toThrow(
      'permission denied',
    );
  });
  it('treats an unselected group administrator as a nonparticipant and reserves role changes for the owner', async () => {
    await db.query(
      "insert into public.ssbu_group_members(group_id,discord_id,display_name,role) values($1,$2,'Nonparticipating admin','admin')",
      [gids[0], dids[5]],
    );
    const eid = await createExchange();
    await candidate(eid);
    await finalize(owner, eid);
    const view = await cmd<{ own_member_id: string | null; recipient: unknown }>(
      users[5],
      'exchange',
      { exchange_id: eid },
    );
    expect(view.own_member_id).toBe(null);
    expect(view.recipient).toBe(null);
    const chain = await chainContext(users[5], eid);
    expect(chain.own_member_id).toBe(null);
    await expect(
      cmd(users[5], 'member_save', {
        group_id: gids[0],
        discord_id: dids[2],
        display_name: 'Member',
        role: 'admin',
      }),
    ).rejects.toThrow('Only the owner');
  });
  it('validates group membership and rejects cross-group participants transactionally', async () => {
    const eid = await createExchange();
    await expect(
      cmd(owner, 'participants_set', { exchange_id: eid, members: [mids[0], mids[6]] }),
    ).rejects.toThrow('Invalid');
    expect(
      (
        await db.query(
          'select count(*)::int n from public.ssbu_exchange_participants where exchange_id=$1',
          [eid],
        )
      ).rows[0].n,
    ).toBe(5);
    await expect(
      cmd(owner, 'participants_set', { exchange_id: eid, members: [mids[0], mids[0]] }),
    ).rejects.toThrow();
  });
  it('independently rejects history repeats and limits recent mode to the last exchanges', async () => {
    const pastYear = (
      name: string,
      after: string | null,
      members: string[],
      giver: string,
      recipient: string,
    ) =>
      cmd<{ id: string }>(owner, 'history_import', {
        group_id: gids[1],
        name,
        after,
        members,
        pairs: [{ giver, recipient }],
      });
    const old = await pastYear('Old year', null, mids.slice(5), mids[5], mids[6]);
    const newcomer = await cmd<{ id: string }>(owner, 'past_member_add', {
      group_id: gids[1],
      display_name: 'Newer person',
    });
    const newer = await pastYear(
      'Newer year',
      old.id,
      [mids[5], newcomer.id],
      mids[5],
      newcomer.id,
    );
    const result = await cmd<{ id: string }>(owner, 'exchange_create', {
      group_id: gids[1],
      name: 'Strict draw',
      mode: 'strict',
    });
    await cmd(owner, 'participants_set', { exchange_id: result.id, members: mids.slice(5) });
    const ctx = await cmd<{ exchange: { revision: number }; group_revision: number }>(
      owner,
      'draw_context',
      { exchange_id: result.id },
    );
    const payload = {
      exchange_id: result.id,
      pairs: [
        { giver: mids[5], recipient: mids[6] },
        { giver: mids[6], recipient: mids[5] },
      ],
      optimal: true,
      revision: ctx.exchange.revision,
      group_revision: ctx.group_revision,
    };
    // strict mode should reject the match recorded in the old year
    await expect(cmd(owner, 'candidate_save', payload)).rejects.toThrow('historical restrictions');
    // avoiding only the last exchange should allow it, since the old year is two exchanges back
    await db.query("update public.ssbu_exchanges set mode='recent',recent_count=1 where id=$1", [
      result.id,
    ]);
    await expect(cmd(owner, 'candidate_save', payload)).resolves.toHaveProperty(
      'report.valid',
      true,
    );
    await db.query('update public.ssbu_exchanges set recent_count=2 where id=$1', [result.id]);
    await expect(cmd(owner, 'candidate_save', payload)).rejects.toThrow('historical restrictions');
    // finalizing should re-check the rule, even for a candidate saved under a looser one
    await db.query("update public.ssbu_exchanges set mode='strict' where id=$1", [result.id]);
    await expect(finalize(owner, result.id)).rejects.toThrow('historical restrictions');
    // clear this group's history so later tests start from an empty timeline
    for (const [id, name] of [
      [result.id, 'Strict draw'],
      [newer.id, 'Newer year'],
      [old.id, 'Old year'],
    ])
      await removeExchange(owner, id, name);
  });
  it('finalizes once under concurrency, keeps maps private, and prevents regeneration', async () => {
    const eid = await createExchange();
    await candidate(eid);
    const results = await Promise.allSettled([finalize(owner, eid), finalize(owner, eid)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const a = await asUser<{ giver: string }>(
      users[2],
      'select * from public.ssbu_assignments where exchange_id=$1',
      [eid],
    );
    expect(a).toHaveLength(1);
    expect(a[0].giver).toBe(mids[2]);
    const unrelated = await asUser(
      users[6],
      'select * from public.ssbu_assignments where exchange_id=$1',
      [eid],
    );
    expect(unrelated).toHaveLength(0);
    const view = await cmd<Record<string, unknown>>(users[0], 'exchange', { exchange_id: eid });
    expect(view).not.toHaveProperty('assignments');
    expect(view).not.toHaveProperty('pairs');
    await expect(chainContext(users[2], eid)).rejects.toThrow('administrator');
    await expect(cmd(owner, 'draw_context', { exchange_id: eid })).rejects.toThrow(
      'Only live drafts',
    );
    await expect(cmd(owner, 'participants_set', { exchange_id: eid, members: [] })).rejects.toThrow(
      'Only live',
    );
  });
  it('rejects stale candidates when another exchange finalizes', async () => {
    const a = await createExchange(),
      b = await createExchange();
    await candidate(a);
    await candidate(b);
    await finalize(owner, b);
    await expect(finalize(owner, a)).rejects.toThrow('stale');
  });
  it('allows only own wishlist edits and own recipient reads', async () => {
    const finalized = (
      await db.query(
        "select id from public.ssbu_exchanges where group_id=$1 and status='finalized' limit 1",
        [gids[0]],
      )
    ).rows[0].id;
    const pair = (
      await db.query(
        'select giver,recipient from public.ssbu_assignments where exchange_id=$1 and giver=$2',
        [finalized, mids[2]],
      )
    ).rows[0] as Pair;
    const recipientIndex = mids.indexOf(pair.recipient);
    const items = await cmd<{ id: string }[]>(users[recipientIndex], 'wishlist_save', {
      title: 'Private wish',
      description: 'A surprise',
      price: 12,
      url: 'https://example.test',
    });
    await cmd(users[6], 'wishlist_save', {
      title: 'Other group private wish',
      description: '',
      price: null,
    });
    expect(
      await asUser(users[2], 'select title from public.ssbu_wishlist_items where discord_id=$1', [
        dids[recipientIndex],
      ]),
    ).toHaveLength(1);
    expect(
      await asUser(users[2], 'select title from public.ssbu_wishlist_items where discord_id=$1', [
        dids[6],
      ]),
    ).toHaveLength(0);
    await expect(
      cmd(users[2], 'wishlist_save', {
        id: items[0].id,
        title: 'stolen',
        description: '',
        price: null,
      }),
    ).rejects.toThrow('not found');
  });
  it('imports partial history with an explicit roster and keeps pairings private', async () => {
    const r = await cmd<{ id: string; complete: boolean }>(owner, 'history_import', {
      group_id: gids[0],
      name: 'Partial 2024',
      after: null,
      members: mids.slice(0, 5),
      pairs: [{ giver: mids[0], recipient: mids[1] }],
    });
    expect(r.complete).toBe(false);
    expect(
      await asUser(
        users[0],
        'select * from public.ssbu_historical_assignments where exchange_id=$1',
        [r.id],
      ),
    ).toHaveLength(0);
    await expect(
      cmd(users[2], 'history_correct', { exchange_id: r.id, acknowledge: true }),
    ).rejects.toThrow('administrator');
    await cmd(owner, 'history_correct', {
      exchange_id: r.id,
      acknowledge: true,
      name: 'Corrected partial 2024',
      members: mids.slice(0, 5),
      pairs: [{ giver: mids[0], recipient: mids[2] }],
    });
    expect(
      (
        await db.query(
          'select previous_pairs from ssbu_private.history_audit where exchange_id=$1',
          [r.id],
        )
      ).rows[0].previous_pairs[0].recipient,
    ).toBe(mids[1]);
    expect(
      (
        await db.query(
          'select recipient from public.ssbu_historical_assignments where exchange_id=$1',
          [r.id],
        )
      ).rows[0].recipient,
    ).toBe(mids[2]);
  });
  it('queues idempotently, leases exclusively, and requires explicit uncertain-delivery retry', async () => {
    const eid = (
      await db.query(
        "select id from public.ssbu_exchanges where group_id=$1 and status='finalized' limit 1",
        [gids[0]],
      )
    ).rows[0].id;
    await cmd(owner, 'notifications_queue', { exchange_id: eid });
    await cmd(owner, 'notifications_queue', { exchange_id: eid });
    expect(
      (
        await db.query(
          'select count(*)::int n from public.ssbu_notification_deliveries where exchange_id=$1',
          [eid],
        )
      ).rows[0].n,
    ).toBe(5);
    const claims = await Promise.all(
      Array.from({ length: 6 }, () => db.query('select public.ssbu_claim_delivery($1) job', [eid])),
    );
    const jobs = claims.map((r) => r.rows[0].job).filter(Boolean);
    expect(jobs).toHaveLength(5);
    expect(new Set(jobs.map((j) => j.delivery.id)).size).toBe(5);
    const d = jobs[0].delivery;
    expect(
      (
        await db.query(
          'select public.ssbu_finish_delivery($1,$2,\'{"status":"sent","message_id":"123"}\') ok',
          [d.id, randomUUID()],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await db.query(
          'select public.ssbu_finish_delivery($1,$2,\'{"status":"sent","message_id":"123"}\') ok',
          [d.id, d.lease_id],
        )
      ).rows[0].ok,
    ).toBe(true);
    await db.query(
      "update public.ssbu_notification_deliveries set lease_until=now()-interval '1 minute' where exchange_id=$1 and status='sending'",
      [eid],
    );
    expect((await db.query('select public.ssbu_claim_delivery($1) job', [eid])).rows[0].job).toBe(
      null,
    );
    expect(
      (
        await db.query(
          "select count(*)::int n from public.ssbu_notification_deliveries where exchange_id=$1 and error_code='uncertain_delivery'",
          [eid],
        )
      ).rows[0].n,
    ).toBe(4);
    await expect(cmd(owner, 'notifications_retry', { exchange_id: eid })).rejects.toThrow(
      'Acknowledge',
    );
    await cmd(owner, 'notifications_retry', { exchange_id: eid, acknowledge: true });
    expect(
      (
        await db.query(
          "select count(*)::int n from public.ssbu_notification_deliveries where exchange_id=$1 and status='sent'",
          [eid],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('requires administrator authorization and exact name confirmation to delete', async () => {
    const eid = await createExchange();
    await expect(removeExchange(users[2], eid)).rejects.toThrow('administrator');
    await expect(removeExchange(users[6], eid)).rejects.toThrow('administrator');
    await expect(removeExchange(owner, eid, 'wrong name')).rejects.toThrow('exact exchange name');
    await expect(
      asUser(owner, 'select public.ssbu_delete_exchange($1,$2,$3)', [owner, eid, 'Test exchange']),
    ).rejects.toThrow('permission denied');
    expect(
      (
        await db.query(
          'select count(*)::int n from public.ssbu_exchange_participants where exchange_id=$1',
          [eid],
        )
      ).rows[0].n,
    ).toBe(5);
    await candidate(eid);
    expect(await removeExchange(users[5], eid)).toMatchObject({ deleted: true, group_id: gids[0] });
    for (const t of [
      'public.ssbu_exchanges',
      'public.ssbu_exchange_participants',
      'public.ssbu_draw_reports',
      'ssbu_private.candidates',
    ]) {
      const field = t === 'public.ssbu_exchanges' ? 'id' : 'exchange_id';
      expect(
        (await db.query(`select count(*)::int n from ${t} where ${field}=$1`, [eid])).rows[0].n,
      ).toBe(0);
    }
  });
  it('blocks deletion during delivery, then removes finalized records and invalidates dependent candidates', async () => {
    const eid = await createExchange();
    await candidate(eid);
    await finalize(owner, eid);
    const pending = await createExchange();
    await candidate(pending);
    await cmd(owner, 'notifications_queue', { exchange_id: eid });
    const job = (await db.query('select public.ssbu_claim_delivery($1) job', [eid])).rows[0].job;
    await expect(removeExchange(owner, eid)).rejects.toThrow('Notifications are being delivered');
    expect(
      (
        await db.query('select count(*)::int n from public.ssbu_assignments where exchange_id=$1', [
          eid,
        ])
      ).rows[0].n,
    ).toBe(5);
    await db.query(
      'select public.ssbu_finish_delivery($1,$2,\'{"status":"sent","message_id":"123"}\')',
      [job.delivery.id, job.delivery.lease_id],
    );
    const results = await Promise.allSettled([
      removeExchange(owner, eid),
      removeExchange(owner, eid),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const table of [
      'ssbu_assignments',
      'ssbu_notification_deliveries',
      'ssbu_exchange_participants',
    ])
      expect(
        (await db.query(`select count(*)::int n from public.${table} where exchange_id=$1`, [eid]))
          .rows[0].n,
      ).toBe(0);
    await expect(finalize(owner, pending)).rejects.toThrow('stale');
    await expect(cmd(users[0], 'exchange', { exchange_id: eid })).rejects.toThrow('unavailable');
  });
  it('removes imported history and its correction audit without changing other exchanges or members', async () => {
    const r = await cmd<{ id: string }>(owner, 'history_import', {
      group_id: gids[0],
      name: 'History to delete',
      after: null,
      members: mids.slice(0, 5),
      pairs: [{ giver: mids[0], recipient: mids[1] }],
    });
    await cmd(owner, 'history_correct', {
      exchange_id: r.id,
      acknowledge: true,
      name: 'History to delete',
      members: mids.slice(0, 5),
      pairs: [{ giver: mids[0], recipient: mids[2] }],
    });
    const before = (
      await db.query('select count(*)::int n from public.ssbu_group_members where group_id=$1', [
        gids[0],
      ])
    ).rows[0].n;
    const otherGroupExchanges = async () =>
      (
        await db.query('select count(*)::int n from public.ssbu_exchanges where group_id=$1', [
          gids[1],
        ])
      ).rows[0].n;
    const otherBefore = await otherGroupExchanges();
    await removeExchange(owner, r.id, 'History to delete');
    expect(
      (
        await db.query(
          'select count(*)::int n from public.ssbu_historical_assignments where exchange_id=$1',
          [r.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query(
          'select count(*)::int n from ssbu_private.history_audit where exchange_id=$1',
          [r.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query('select count(*)::int n from public.ssbu_group_members where group_id=$1', [
          gids[0],
        ])
      ).rows[0].n,
    ).toBe(before);
    expect(await otherGroupExchanges()).toBe(otherBefore);
  });
  it('authorizes private draft review and rejects changed candidate versions before finalizing', async () => {
    const eid = await createExchange();
    const review = (uid: string, stamp: string | null) =>
      db.query('select public.ssbu_review_chain($1,$2,$3) result', [uid, eid, stamp]);
    await expect(review(owner, null)).rejects.toThrow('Generate a candidate');
    await candidate(eid);
    const view = await cmd<{ validation: { created_at: string } }>(owner, 'exchange', {
      exchange_id: eid,
    });
    const first = view.validation.created_at;
    await expect(review(users[2], first)).rejects.toThrow('administrator');
    await expect(review(users[6], first)).rejects.toThrow('administrator');
    await expect(
      asUser(owner, 'select public.ssbu_review_chain($1,$2,$3)', [owner, eid, first]),
    ).rejects.toThrow('permission denied');
    expect((await review(users[0], first)).rows[0].result).toMatchObject({
      own_member_id: mids[0],
      pairs: expect.any(Array),
    });
    expect((await review(users[5], first)).rows[0].result.own_member_id).toBe(null);
    expect(
      (
        await db.query('select count(*)::int n from public.ssbu_assignments where exchange_id=$1', [
          eid,
        ])
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query(
          'select count(*)::int n from public.ssbu_notification_deliveries where exchange_id=$1',
          [eid],
        )
      ).rows[0].n,
    ).toBe(0);
    await candidate(eid);
    await expect(review(owner, first)).rejects.toThrow('candidate changed');
    await expect(
      db.query('select public.ssbu_finalize_reviewed_draw($1,$2,$3)', [owner, eid, first]),
    ).rejects.toThrow('candidate changed');
    const current = await cmd<{ validation: { created_at: string } }>(owner, 'exchange', {
      exchange_id: eid,
    });
    await expect(
      db.query('select public.ssbu_finalize_reviewed_draw($1,$2,$3)', [
        users[2],
        eid,
        current.validation.created_at,
      ]),
    ).rejects.toThrow('administrator');
    const outcomes = await Promise.allSettled([
      db.query('select public.ssbu_finalize_reviewed_draw($1,$2,$3)', [
        owner,
        eid,
        current.validation.created_at,
      ]),
      db.query('select public.ssbu_finalize_reviewed_draw($1,$2,$3)', [
        owner,
        eid,
        current.validation.created_at,
      ]),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await review(owner, null)).rows[0].result.pairs).toHaveLength(5);
    expect(
      (
        await db.query(
          'select count(*)::int n from public.ssbu_notification_deliveries where exchange_id=$1',
          [eid],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('reports every queued giver without revealing recipients and denies nonadministrators', async () => {
    const eid = await createExchange();
    await candidate(eid);
    await finalize(owner, eid);
    await cmd(owner, 'notifications_queue', { exchange_id: eid });
    await cmd(owner, 'notifications_queue', { exchange_id: eid });
    const summary = (
      await db.query('select public.ssbu_delivery_progress($1,$2) result', [owner, eid])
    ).rows[0].result;
    expect(summary).toMatchObject({
      total: 5,
      pending: 5,
      sending: 0,
      sent: 0,
      failed: 0,
      next_attempt_at: null,
    });
    expect(summary.deliveries).toHaveLength(5);
    expect(JSON.stringify(summary)).not.toContain('recipient');
    await expect(
      db.query('select public.ssbu_delivery_progress($1,$2)', [users[2], eid]),
    ).rejects.toThrow('administrator');
    await expect(
      asUser(owner, 'select public.ssbu_delivery_progress($1,$2)', [owner, eid]),
    ).rejects.toThrow('permission denied');
    await db.query(
      "update public.ssbu_notification_deliveries set next_attempt_at=now()+interval '30 seconds' where exchange_id=$1",
      [eid],
    );
    expect(
      (await db.query('select public.ssbu_delivery_progress($1,$2) result', [owner, eid])).rows[0]
        .result.next_attempt_at,
    ).toBeTruthy();
  });
  it('replaces the dispatcher with service-only per-operation functions', async () => {
    expect(
      (await db.query("select to_regprocedure('public.ssbu_command(uuid,text,jsonb)') fn")).rows[0]
        .fn,
    ).toBe(null);
    await expect(asUser(users[2], "select public.ssbu_group($1,'{}')", [users[2]])).rejects.toThrow(
      'permission denied',
    );
    await expect(
      asUser(users[2], 'select ssbu_private.require_owner($1)', [users[2]]),
    ).rejects.toThrow('permission denied');
  });
  it('keeps server activation owner-only', async () => {
    await expect(
      cmd(users[2], 'activate_group', { guild_id: '800000000000000099', name: 'Hijack' }),
    ).rejects.toThrow('owner access');
    expect(await cmd(owner, 'owner_check')).toEqual({ owner: true });
  });
  it('records past-only people who never join new draws or gain access', async () => {
    const joe = await cmd<{ id: string; existing: boolean }>(owner, 'past_member_add', {
      group_id: gids[0],
      display_name: 'Grandpa Joe',
    });
    expect(joe.existing).toBe(false);
    const ann = await cmd<{ id: string }>(owner, 'past_member_add', {
      group_id: gids[0],
      display_name: 'Ann',
      discord_id: dids[6],
    });
    // a known Discord ID should reuse the same record instead of making a duplicate
    expect(
      await cmd(owner, 'past_member_add', {
        group_id: gids[0],
        display_name: 'Ann again',
        discord_id: dids[6],
      }),
    ).toMatchObject({ id: ann.id, existing: true });
    await expect(
      cmd(users[2], 'past_member_add', { group_id: gids[0], display_name: 'Nope' }),
    ).rejects.toThrow('administrator');
    const year = await cmd<{ id: string; complete: boolean }>(owner, 'history_import', {
      group_id: gids[0],
      name: 'With past-only people',
      after: null,
      members: [mids[0], mids[1], joe.id],
      pairs: [
        { giver: mids[0], recipient: joe.id },
        { giver: joe.id, recipient: mids[1] },
        { giver: mids[1], recipient: mids[0] },
      ],
    });
    expect(year.complete).toBe(true);
    const eid = await createExchange();
    await expect(
      cmd(owner, 'participants_set', { exchange_id: eid, members: [mids[0], joe.id] }),
    ).rejects.toThrow('Invalid');
    type Members = { members: { id: string; past_only: boolean; active: boolean }[] };
    const group = await cmd<Members>(owner, 'group', { group_id: gids[0] });
    expect(group.members.find((m) => m.id === joe.id)).toMatchObject({
      past_only: true,
      active: false,
    });
    // a past-only person who joins the server should become a regular member
    await cmd(owner, 'member_save', {
      group_id: gids[0],
      discord_id: dids[6],
      display_name: 'Ann',
    });
    const after = await cmd<Members>(owner, 'group', { group_id: gids[0] });
    expect(after.members.find((m) => m.id === ann.id)).toMatchObject({
      past_only: false,
      active: true,
    });
    await cmd(owner, 'member_save', {
      group_id: gids[0],
      discord_id: dids[6],
      display_name: 'Ann',
      active: false,
    });
  });
  it('rejects inconsistent past years before saving anything', async () => {
    const base = { group_id: gids[0], name: 'Bad year', after: null, members: mids.slice(0, 3) };
    const count = async () =>
      (await db.query("select count(*)::int n from public.ssbu_exchanges where name='Bad year'"))
        .rows[0].n;
    const before = await count();
    await expect(
      cmd(owner, 'history_import', { ...base, pairs: [{ giver: mids[0], recipient: mids[4] }] }),
    ).rejects.toThrow('between people in this year');
    await expect(
      cmd(owner, 'history_import', {
        ...base,
        pairs: [
          { giver: mids[0], recipient: mids[1] },
          { giver: mids[0], recipient: mids[2] },
        ],
      }),
    ).rejects.toThrow('give once and receive once');
    await expect(
      cmd(owner, 'history_import', { ...base, pairs: [{ giver: mids[0], recipient: mids[0] }] }),
    ).rejects.toThrow('themselves');
    await expect(
      cmd(owner, 'history_import', {
        ...base,
        members: [mids[0], mids[6]],
        pairs: [{ giver: mids[0], recipient: mids[6] }],
      }),
    ).rejects.toThrow('people');
    expect(await count()).toBe(before);
  });
  it('orders past years by placement and ranks draw history by that order', async () => {
    const seq = async (id: string) =>
      Number(
        (await db.query('select sequence from public.ssbu_exchanges where id=$1', [id])).rows[0]
          .sequence,
      );
    const first = await cmd<{ id: string }>(owner, 'history_import', {
      group_id: gids[1],
      name: 'Earliest',
      after: null,
      members: mids.slice(5),
      pairs: [{ giver: mids[5], recipient: mids[6] }],
    });
    const latest = await cmd<{ id: string }>(owner, 'exchange_create', {
      group_id: gids[1],
      name: 'Newest draw',
      mode: 'recent',
      recent_count: 1,
      currency: 'USD',
      budget: null,
    });
    const middle = await cmd<{ id: string }>(owner, 'history_import', {
      group_id: gids[1],
      name: 'Middle',
      after: first.id,
      members: mids.slice(5),
      pairs: [{ giver: mids[6], recipient: mids[5] }],
    });
    expect(await seq(first.id)).toBeLessThan(await seq(middle.id));
    expect(await seq(middle.id)).toBeLessThan(await seq(latest.id));
    await cmd(owner, 'participants_set', { exchange_id: latest.id, members: mids.slice(5) });
    const ctx = await cmd<{
      history: { exchange: string; order: number }[];
      exchange: { revision: number };
      group_revision: number;
    }>(owner, 'draw_context', { exchange_id: latest.id });
    const order = (id: string) => ctx.history.find((h) => h.exchange === id)!.order;
    expect(order(middle.id)).toBeGreaterThan(order(first.id));
    // avoiding the last exchange should block the match recorded in Middle, the latest past year
    await expect(
      cmd(owner, 'candidate_save', {
        exchange_id: latest.id,
        pairs: [
          { giver: mids[6], recipient: mids[5] },
          { giver: mids[5], recipient: mids[6] },
        ],
        optimal: true,
        revision: ctx.exchange.revision,
        group_revision: ctx.group_revision,
      }),
    ).rejects.toThrow('historical restrictions');
  });
  it('keeps the wishlist in the order its owner sets', async () => {
    const titles = (items: { title: string }[]) => items.map((i) => i.title);
    await cmd(users[3], 'wishlist_save', { title: 'Socks', description: '', price: null, url: '' });
    const items = await cmd<{ id: string; title: string }[]>(users[3], 'wishlist_save', {
      title: 'Book',
      description: '',
      price: null,
      url: '',
    });
    expect(titles(items).slice(-2)).toEqual(['Socks', 'Book']);
    const ids = items.map((i) => i.id).reverse();
    expect(titles(await cmd(users[3], 'wishlist_reorder', { ids }))).toEqual(
      titles(items).reverse(),
    );
    await expect(cmd(users[3], 'wishlist_reorder', { ids: ids.slice(1) })).rejects.toThrow(
      'changed',
    );
    await expect(cmd(users[4], 'wishlist_reorder', { ids })).rejects.toThrow();
    expect(JSON.stringify(await cmd(users[3], 'wishlist'))).not.toContain('discord_id');
  });
  it('shows admins who has an empty wishlist and limits reminders to once an hour', async () => {
    const eid = await createExchange();
    await cmd(users[1], 'wishlist_save', { title: 'Secret title', description: '', price: null });
    type Status = {
      people: { id: string; has_wishes: boolean }[];
      reminded_recently: boolean;
    };
    const status = await cmd<Status>(owner, 'wishlist_status', { exchange_id: eid });
    expect(status.people).toHaveLength(5);
    expect(status.people.find((p) => p.id === mids[1])?.has_wishes).toBe(true);
    expect(status.reminded_recently).toBe(false);
    // admins should learn only whether a wishlist is empty, never what's on it
    expect(JSON.stringify(status)).not.toContain('Secret title');
    await expect(cmd(users[2], 'wishlist_status', { exchange_id: eid })).rejects.toThrow(
      'administrator',
    );
    await expect(cmd(users[2], 'wishlist_reminder', { exchange_id: eid })).rejects.toThrow(
      'administrator',
    );
    const round = await cmd<{ people: { discord_id: string }[] }>(owner, 'wishlist_reminder', {
      exchange_id: eid,
    });
    // only people with empty wishlists should be reminded
    const reminded = round.people.map((p) => p.discord_id);
    expect(reminded).not.toContain(dids[1]);
    expect(reminded.length).toBe(status.people.filter((p) => !p.has_wishes).length);
    await expect(cmd(owner, 'wishlist_reminder', { exchange_id: eid })).rejects.toThrow(
      'less than an hour ago',
    );
    expect(
      (await cmd<Status>(owner, 'wishlist_status', { exchange_id: eid })).reminded_recently,
    ).toBe(true);
    await expect(
      asUser(owner, "select public.ssbu_wishlist_reminder($1,'{}')", [owner]),
    ).rejects.toThrow('permission denied');
  });
});
