import { expect, test, type Page } from '@playwright/test';

// 申請 → 承認の主要フローを確認するスモークテスト。
// データは localStorage にのみ保存されるため、各テストは新しいブラウザコンテキスト（＝初期データ）から始まる。

const USERS = {
  requester: '田中 美咲（営業担当）',
  approver: '鈴木 部長（承認者）',
} as const;

async function switchUser(page: Page, label: string) {
  await page.getByLabel('操作ユーザー').selectOption({ label });
}

/** 表示中の列のうち、見出しが label の列の data-cell 用インデックスを返す */
async function columnIndex(page: Page, label: string): Promise<number> {
  const headers = page.getByRole('grid', { name: '取引先マスタ' }).locator('thead th');
  const texts = await headers.allInnerTexts();
  // 先頭は行番号用の角セル
  const i = texts.slice(1).findIndex((t) => t.replace('*', '').trim() === label);
  expect(i, `列「${label}」が表示されていること`).toBeGreaterThanOrEqual(0);
  return i;
}

function cell(page: Page, r: number, c: number) {
  return page.locator(`td[data-cell="${r}:${c}"]`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '取引先マスタ', level: 1 })).toBeVisible();
});

test('マスタ画面が表示され、ロールに応じて機密項目の列が切り替わる', async ({ page }) => {
  const grid = page.getByRole('grid', { name: '取引先マスタ' });
  await expect(grid).toBeVisible();
  await expect(grid.locator('tbody tr').first()).toBeVisible();

  // 営業担当は振込先口座を閲覧できない（列が表示されない）
  await switchUser(page, USERS.requester);
  await expect(grid.locator('thead')).toContainText('取引先名');
  await expect(grid.locator('thead')).not.toContainText('振込先口座');

  // 承認者は閲覧できる
  await switchUser(page, USERS.approver);
  await expect(grid.locator('thead')).toContainText('振込先口座');
});

test('画面切替のナビゲーションで各画面が開く', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: '画面切替' });
  await nav.getByRole('button', { name: /承認/ }).click();
  await expect(page).toHaveURL(/#workflow$/);
  await expect(page.getByRole('tablist', { name: '変更セットの絞り込み' })).toBeVisible();

  await nav.getByRole('button', { name: '項目設定' }).click();
  await expect(page).toHaveURL(/#columns$/);

  await nav.getByRole('button', { name: '閲覧範囲' }).click();
  await expect(page).toHaveURL(/#access$/);

  await nav.getByRole('button', { name: 'マスタ' }).click();
  await expect(page).toHaveURL(/#master$/);
  await expect(page.getByRole('grid', { name: '取引先マスタ' })).toBeVisible();
});

test('営業担当がセルを修正して申請し、承認者が承認するとマスタに反映される', async ({ page }) => {
  const newAddress = '東京都千代田区E2E町1-2-3';
  const title = 'E2E 住所変更の申請';

  // 1. 営業担当として所在地を編集
  await switchUser(page, USERS.requester);
  const addrCol = await columnIndex(page, '所在地');
  const target = cell(page, 0, addrCol);
  await target.dblclick();
  const editor = target.getByRole('textbox', { name: '所在地' });
  await editor.fill(newAddress);
  await editor.press('Enter');
  await expect(target).toContainText(newAddress);
  await expect(target).toHaveClass(/st-draft/);
  await expect(page.locator('.draft-count')).toContainText('未申請 1 件');

  // 2. 申請
  await page.getByRole('toolbar', { name: '編集操作' }).getByRole('button', { name: '申請する' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('件名', { exact: true }).fill(title);
  await dialog.getByLabel('申請理由', { exact: true }).fill('E2E テストからの申請');
  await dialog.getByRole('button', { name: '申請する' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.draft-count')).toContainText('未申請 0 件');
  await expect(target).toHaveClass(/st-pending/);

  // 3. 承認者に切り替えて承認
  await switchUser(page, USERS.approver);
  await page.getByRole('navigation', { name: '画面切替' }).getByRole('button', { name: /承認/ }).click();
  const cs = page.locator('li.cs').filter({ hasText: title });
  await expect(cs).toHaveCount(1);
  const summary = cs.locator('.cs-summary');
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
  await expect(cs.locator('.diff')).toContainText(newAddress);
  await cs.getByRole('button', { name: '承認する' }).click();
  // 承認済みは「承認待ち」タブから外れるため「すべて」で確認する
  await expect(cs).toHaveCount(0);
  await page.getByRole('tablist', { name: '変更セットの絞り込み' }).getByRole('tab', { name: /すべて/ }).click();
  await expect(cs.locator('.cs-status')).toHaveText('承認済');

  // 4. マスタに反映されている
  await page.getByRole('navigation', { name: '画面切替' }).getByRole('button', { name: 'マスタ' }).click();
  const grid = page.getByRole('grid', { name: '取引先マスタ' });
  await expect(grid.locator('td.cell').filter({ hasText: newAddress })).toHaveClass(/st-approved/);
});
