import { test, expect } from '@playwright/test';

test.describe('Authentication flow', () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'testpass123';

  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('приглашение');
  });

  test('register a new account', async ({ page }) => {
    await page.goto('/login');

    // Switch to register tab
    await page.click('button:has-text("Регистрация")');
    await expect(page.locator('h1')).toContainText('Создать аккаунт');

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]:has-text("Зарегистрироваться")');

    // Should redirect to cabinet
    await page.waitForURL('**/me/invitations');
    await expect(page.locator('h1')).toContainText('Мои приглашения');
  });

  test('login with existing account', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]:has-text("Войти")');

    await page.waitForURL('**/me/invitations');
    await expect(page.locator('h1')).toContainText('Мои приглашения');
  });

  test('protected page redirects to login', async ({ page }) => {
    await page.goto('/create?template=simple-date');
    await page.waitForURL('**/login*');
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]:has-text("Войти")');

    await page.waitForURL('**/login*error*');
  });
});

test.describe('Mobile viewport', () => {
  test('landing page is responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });
});
