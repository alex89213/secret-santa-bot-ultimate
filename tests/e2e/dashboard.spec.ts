/**
 * Description:  Browser test of the whole workflow at desktop and phone sizes, with Discord mocked.
 * Author:       Alex Wu
 * Dependencies: @playwright/test, @supabase/supabase-js, pg, node:crypto, node:fs
 * Usage:        npm run test:e2e
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (apiUrl !== 'http://127.0.0.1:54321')
  throw new Error('E2E tests run exclusively against isolated local Supabase.');
const supabase = createClient(apiUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});
let uid = '',
  groupId = '',
  exchangeId = '';
let accessToken = '',
  refreshToken = '';
const discordId = '710000000000000001',
  otherIds = ['710000000000000002', '710000000000000003', '710000000000000004'];
test.beforeAll(async () => {
  if ((await pool.query('select count(*)::int n from public.ssbu_instance_roles')).rows[0].n)
    throw new Error(
      'E2E first-owner test requires an unclaimed isolated local instance. Existing data will not be removed.',
    );
  const email = `ssbu-e2e-${randomUUID()}@example.test`;
  const result = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: 'Alex Winter' },
  });
  if (result.error) throw result.error;
  uid = result.data.user.id;
  await pool.query(
    "insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) values($1,$2,$3,'discord',$4,now(),now(),now())",
    [randomUUID(), uid, discordId, JSON.stringify({ sub: discordId })],
  );
  // make a test session directly, since the app itself only offers Discord sign-in
  const link = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const anon = createClient(apiUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  const session = await anon.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (session.error) throw session.error;
  accessToken = session.data.session!.access_token;
  refreshToken = session.data.session!.refresh_token;
});
test.afterAll(async () => {
  if (groupId) {
    for (const table of ['ssbu_notification_deliveries', 'ssbu_draw_reports'])
      await pool.query(
        `delete from public.${table} where exchange_id in (select id from public.ssbu_exchanges where group_id=$1)`,
        [groupId],
      );
    await pool.query(
      'delete from ssbu_private.candidates where exchange_id in (select id from public.ssbu_exchanges where group_id=$1)',
      [groupId],
    );
    for (const table of [
      'ssbu_assignments',
      'ssbu_historical_assignments',
      'ssbu_exchange_participants',
      'ssbu_exchanges',
      'ssbu_group_members',
    ])
      await pool.query(`delete from public.${table} where group_id=$1`, [groupId]);
    await pool.query('delete from public.ssbu_groups where id=$1', [groupId]);
  }
  if (uid) {
    await pool.query('delete from public.ssbu_wishlist_items where discord_id=$1', [discordId]);
    await pool.query('delete from public.ssbu_instance_roles where user_id=$1', [uid]);
    await pool.query('delete from ssbu_private.rate_limits where key=$1', [`setup:${uid}`]);
    await pool.query('delete from public.ssbu_profiles where id=$1', [uid]);
    await pool.query("delete from auth.identities where user_id=$1 and provider='discord'", [uid]);
    await supabase.auth.admin.deleteUser(uid);
  }
  await pool.end();
});
const noSideScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
test('desktop and mobile private exchange workflow', async ({ page, context }) => {
  mkdirSync('output/playwright', { recursive: true });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Secret Santa' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Discord' })).toBeVisible();
  await page.screenshot({ path: 'output/playwright/login-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: 'output/playwright/login-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  // a signed-out visit to /setup should explain that sign-in comes first
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login\?next=setup$/);
  await expect(page.getByText('Sign in with Discord first.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Discord' })).toHaveAttribute(
    'href',
    '/auth/login?next=setup',
  );
  // supabase ssr keeps the session as base64url json in an HttpOnly cookie
  const value =
    'base64-' +
    Buffer.from(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: uid },
      }),
    ).toString('base64url');
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Claim this site' })).toBeVisible();
  await page.getByLabel('Setup secret').fill('incorrect');
  await page.getByRole('button', { name: 'Become the owner' }).click();
  await expect(page.getByText('The setup secret is incorrect.', { exact: true })).toBeVisible();
  await page.getByLabel('Setup secret').fill(process.env.INSTANCE_SETUP_SECRET!);
  await page.getByRole('button', { name: 'Become the owner' }).click();
  await expect(page).toHaveURL(/\/servers$/);
  await expect(page.getByRole('heading', { name: 'Add a Discord server' })).toBeVisible();
  groupId = randomUUID();
  await pool.query(
    'insert into public.ssbu_groups(id,name,guild_id,created_by) values($1,$2,$3,$4)',
    [groupId, 'The Fireside Club', '720000000000000001', uid],
  );
  for (const [i, did] of [discordId, ...otherIds].entries())
    await pool.query(
      'insert into public.ssbu_group_members(group_id,discord_id,display_name,role) values($1,$2,$3,$4)',
      [
        groupId,
        did,
        ['Alex Winter', 'Sam Evergreen', 'Jordan Frost', 'Taylor Snow'][i],
        i === 0 ? 'admin' : 'member',
      ],
    );
  await page.goto(`/groups/${groupId}`);
  let joined = false,
    memberRequests = 0,
    deliveryBatches = 0,
    reminders = 0;
  const roster = [{ discord_id: '710000000000000005', display_name: 'Robin Pine' }];
  await page.route('**/api/command', async (route) => {
    const body = route.request().postDataJSON();
    if (body.operation === 'discord_members') {
      memberRequests++;
      const people = joined
        ? [...roster, { discord_id: '710000000000000006', display_name: 'Casey Newjoin' }]
        : roster;
      const matches = people.filter((p) =>
        p.display_name.toLowerCase().includes(String(body.payload.query ?? '').toLowerCase()),
      );
      await route.fulfill({ json: { data: { members: matches, next: null } } });
    } else if (
      body.operation === 'member_save' &&
      ['710000000000000005', '710000000000000006'].includes(body.payload.discord_id)
    ) {
      await pool.query(
        'insert into public.ssbu_group_members(group_id,discord_id,display_name) values($1,$2,$3) on conflict(group_id,discord_id) do update set active=true',
        [groupId, body.payload.discord_id, body.payload.display_name],
      );
      await route.fulfill({ json: { data: { saved: true } } });
    } else if (body.operation === 'wishlist_remind') {
      // pretend every reminder was delivered, without contacting Discord
      reminders++;
      await route.fulfill({
        json: {
          data: {
            sent: ['Alex Winter', 'Jordan Frost', 'Sam Evergreen', 'Taylor Snow'],
            failed: [],
          },
        },
      });
    } else if (['notifications_send', 'notifications_process'].includes(body.operation)) {
      // mark one delivery sent per batch so the progress loop runs without contacting Discord
      if (body.operation === 'notifications_send')
        await pool.query('select public.ssbu_notifications_queue($1,$2::jsonb)', [
          uid,
          JSON.stringify(body.payload),
        ]);
      deliveryBatches++;
      await pool.query(
        "update public.ssbu_notification_deliveries set status='sent',sent_at=now(),attempts=attempts+1 where id=(select id from public.ssbu_notification_deliveries where exchange_id=$1 and status='pending' order by id limit 1)",
        [exchangeId],
      );
      const result = await pool.query('select public.ssbu_delivery_progress($1,$2) data', [
        uid,
        exchangeId,
      ]);
      await route.fulfill({ json: { data: result.rows[0].data } });
    } else await route.continue();
  });
  await page.clock.install();
  // the people tab should load the live Discord list, poll, search and add people
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Robin Pine/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /Robin Pine/ }).check();
  joined = true;
  await page.clock.fastForward(30001);
  await expect(page.getByRole('checkbox', { name: /Casey Newjoin/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Robin Pine/ })).toBeChecked();
  const calls = memberRequests;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => memberRequests).toBeGreaterThan(calls);
  const beforeFocus = memberRequests;
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => memberRequests).toBeGreaterThan(beforeFocus);
  await page.getByLabel('Search Discord members').fill('Casey');
  await page.clock.fastForward(350);
  await expect(page.getByRole('checkbox', { name: /Robin Pine/ })).not.toBeVisible();
  await page.getByRole('checkbox', { name: /Casey Newjoin/ }).check();
  await page.getByRole('button', { name: 'Add 2 people' }).click();
  await expect(page.getByText('Added.', { exact: true })).toBeVisible();
  await page.getByLabel('Search Discord members').fill('');
  await page.clock.fastForward(10);
  await expect(page.getByRole('checkbox', { name: /Robin Pine/ })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: 'output/playwright/people-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // the new exchange form should have no year field and no placeholder text
  await page.getByRole('tab', { name: 'Exchanges', exact: true }).click();
  await page.getByRole('button', { name: 'New exchange' }).click();
  expect(await page.locator('form [placeholder]').count()).toBe(0);
  await expect(page.getByLabel('Year')).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Winter Exchange 2026');
  await page.getByLabel('Budget amount').fill('35');
  await page.getByRole('button', { name: 'Create exchange' }).click();
  await expect(page).toHaveURL(/\/exchanges\//);
  exchangeId = page.url().split('/').pop()!;
  for (const name of ['Alex Winter', 'Sam Evergreen', 'Jordan Frost', 'Taylor Snow'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await page.getByRole('button', { name: 'Save people' }).click();
  await expect(page.getByRole('button', { name: 'Save people' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Draw names' }).click();
  await expect(
    page.getByText('Everyone gives and gets one gift, with no repeats from past years.'),
  ).toBeVisible();
  // check matches should reveal only what was asked for
  const chainResponses: unknown[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/command')) {
      const req = response.request().postDataJSON();
      if (req?.operation === 'chain') chainResponses.push(await response.json());
    }
  });
  const shown = (i: number) =>
    (chainResponses[i] as { data: { connections: unknown[] } }).data.connections;
  await page.getByRole('button', { name: 'Show my match' }).click();
  await expect(page.getByRole('button', { name: 'Hide matches' })).toBeVisible();
  await expect.poll(() => chainResponses.length).toBe(1);
  expect(shown(0)).toHaveLength(1);
  await page.getByRole('button', { name: 'One more' }).click();
  await expect.poll(() => chainResponses.length).toBe(2);
  expect(shown(1)).toHaveLength(2);
  await page.getByLabel('How many matches to show').fill('4');
  await expect(page.getByRole('button', { name: 'Show 4' })).toBeDisabled();
  await page.getByRole('button', { name: 'Hide matches' }).click();
  await expect(page.getByText('Nothing shown yet.')).not.toBeVisible();
  expect(
    (
      await pool.query(
        'select count(*)::int n from public.ssbu_notification_deliveries where exchange_id=$1',
        [exchangeId],
      )
    ).rows[0].n,
  ).toBe(0);
  await page.getByRole('button', { name: 'Redraw' }).click();
  await expect(page.getByRole('button', { name: 'Lock in matches' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Show my match' })).toBeVisible();
  await page.getByRole('button', { name: 'Lock in matches' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lock in', exact: true }).click();
  await expect(page.getByText('You’re giving to', { exact: true })).toBeVisible();
  expect(deliveryBatches).toBe(0);
  await page.getByRole('button', { name: 'Show my match' }).click();
  await expect.poll(() => chainResponses.length).toBe(3);
  expect(shown(2)).toHaveLength(1);
  await page.getByRole('button', { name: 'Hide matches' }).click();
  // one confirmed send should work through every batch
  await page.getByRole('button', { name: 'Send everyone their match' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(/^Sending… \d+ of 4 sent\.$/)).toBeVisible();
  const sentRows = page.locator('.delivery-list > div', { hasText: /Sent$/ });
  for (let batch = 2; batch <= 4; batch++) {
    await page.clock.runFor(1200);
    await expect.poll(() => deliveryBatches).toBe(batch);
    await expect(sentRows).toHaveCount(batch);
  }
  await expect(page.getByText('All 4 sent.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send everyone their match' })).toHaveCount(0);
  // nobody has a wishlist yet, so the admin should be able to remind all four
  await expect(page.getByText('Nobody has added anything yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Remind them on Discord' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send reminders' }).click();
  await expect(page.getByText('Sent 4 reminders.')).toBeVisible();
  expect(reminders).toBe(1);
  expect(
    (
      await pool.query(
        'select count(*)::int n from public.ssbu_notification_deliveries where exchange_id=$1',
        [exchangeId],
      )
    ).rows[0].n,
  ).toBe(4);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/exchange-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: 'output/playwright/exchange-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // a past year should accept someone who is no longer in the server
  await page.goto(`/groups/${groupId}`);
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Add a past year' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Christmas 2025');
  await page.getByRole('button', { name: 'Alex Winter' }).click();
  await page.getByRole('button', { name: 'Sam Evergreen' }).click();
  await page.getByRole('button', { name: /not in the server/ }).click();
  await page.locator('#past-person-name').fill('Grandpa Joe');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: /Grandpa Joe/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('combobox', { name: 'Alex Winter', exact: true })
    .selectOption({ label: 'Sam Evergreen' });
  await expect(page.getByText(/^Partial: 1 of 3/)).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Sam Evergreen', exact: true })
    .selectOption({ label: 'Grandpa Joe' });
  await page.getByRole('combobox', { name: /^Grandpa Joe/ }).selectOption({ label: 'Alex Winter' });
  await expect(page.getByText('Complete: one circle of 3 people.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: 'output/playwright/past-year-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'output/playwright/past-year-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Save past year' }).click();
  await expect(page.getByRole('link', { name: /Christmas 2025/ })).toBeVisible();
  expect(
    (
      await pool.query(
        "select past_only, active, discord_id from public.ssbu_group_members where group_id=$1 and display_name='Grandpa Joe'",
        [groupId],
      )
    ).rows[0],
  ).toEqual({ past_only: true, active: false, discord_id: null });
  // the wishlist should be numbered and reorderable, with no priority labels
  await page.getByRole('link', { name: 'Wishlist', exact: true }).click();
  await page.getByRole('button', { name: 'Add a wish' }).click();
  await page.getByLabel('What is it?').fill('Cozy wool scarf');
  await page.getByLabel(/Details/).fill('Forest green, if you find one.');
  await page.getByLabel(/Rough price/).fill('25');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Cozy wool scarf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Cozy wool scarf' }).click();
  await page.getByLabel('What is it?').fill('Cozy forest-green scarf');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Cozy forest-green scarf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add a wish' }).click();
  await page.getByLabel('What is it?').fill('Board game');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Move Board game up' }).click();
  await expect(page.locator('.wish .title').first()).toHaveText('Board game');
  await expect(page.getByText(/Top wish|Nice to have|Would love/)).toHaveCount(0);
  // home should show the match on the exchange card
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Winter Exchange 2026' })).toBeVisible();
  await expect(page.getByText('You’re giving to', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/playwright/home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/home-mobile.png', fullPage: true });
  expect(await noSideScroll(page)).toBe(true);
  await page.getByRole('link', { name: 'Wishlist', exact: true }).click();
  await page.getByRole('button', { name: 'Add a wish' }).click();
  await expect(page.getByLabel('What is it?')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: 'output/playwright/wishlist-mobile.png', fullPage: true });
  // deleting should require the exact name
  await page.goto(`/exchanges/${exchangeId}`);
  await page.getByRole('button', { name: 'Delete exchange', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const confirmDelete = dialog.getByRole('button', { name: 'Delete exchange', exact: true });
  await expect(confirmDelete).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Winter Exchange 2026', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete exchange', exact: true }).click();
  await dialog.getByLabel(/to confirm/).fill('wrong');
  await expect(confirmDelete).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill('Winter Exchange 2026');
  await page.screenshot({ path: 'output/playwright/delete-exchange-mobile.png', fullPage: false });
  await confirmDelete.click();
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
  await expect(page.getByText('Winter Exchange 2026', { exact: true })).not.toBeVisible();
  await page.goto(`/exchanges/${exchangeId}`);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  // signing out from the account menu should end the session
  await page.goto('/dashboard');
  await page.getByLabel(/Account menu/).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/exchanges/${exchangeId}`);
  await expect(page).toHaveURL(/\/login$/);
});
