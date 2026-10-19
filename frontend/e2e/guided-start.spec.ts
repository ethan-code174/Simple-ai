import { expect, test } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = async (page: any, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

// The guided path a complete beginner takes: pick what the AI does, name it, add a document,
// try it, share it. No canvas, no technical words.
test("a beginner makes and shares an AI with the step-by-step guide", async ({ page, context }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Margaret");
  await page.getByLabel("Email").fill(`guided+${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Sign up" }).click();

  // Step 1: what should it help with?
  await expect(page.getByRole("heading", { name: "What should your AI help with?" })).toBeVisible();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await shot(page, "g1-what");
  await page.getByTestId("kind-customers").click();

  // Step 2: a little about it
  await expect(page.getByRole("heading", { name: "Tell us a little about it" })).toBeVisible();
  await page.getByLabel("What is your business or project called?").fill("Bob's Plumbing");
  await page.getByLabel("What should your AI be called?").fill("Bob's Helper");
  await shot(page, "g2-about");
  await page.getByTestId("build").click();

  // Step 3: documents
  await expect(page.getByRole("heading", { name: "Give it your documents" })).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("wizard-upload").setInputFiles({
    name: "bobs-plumbing.txt", mimeType: "text/plain",
    buffer: Buffer.from("Opening hours: Monday to Friday, 7am to 6pm. Saturday 9am to 1pm.\n\nOur call-out fee is £60, including the first half hour."),
  });
  await expect(page.getByText("bobs-plumbing.txt")).toBeVisible();
  await expect(page.getByText("Added", { exact: true })).toBeVisible();
  await shot(page, "g3-docs");

  // Back goes back without losing anything, and Next doesn't build a second AI.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("What should your AI be called?")).toHaveValue("Bob's Helper");
  await page.getByTestId("build").click();
  await expect(page.getByText("bobs-plumbing.txt")).toBeVisible();
  await page.getByTestId("docs-next").click();

  // Step 4: try it. No AI program here, so it says so plainly and offers the one-click no-AI option.
  await expect(page.getByRole("heading", { name: "Try out Bob's Helper" })).toBeVisible();
  await expect(page.getByTestId("no-ai-box")).toBeVisible();
  await shot(page, "g4-no-ai");
  await page.getByTestId("use-quotes").click();
  await expect(page.getByTestId("no-ai-box")).toHaveCount(0);
  await page.getByTestId("wizard-input").fill("How much is your call-out fee?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText(/£60/).last()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Answer found in: bobs-plumbing\.txt/)).toBeVisible();
  await shot(page, "g5-try");
  await page.getByTestId("try-next").click();

  // Step 5: share it
  await expect(page.getByRole("heading", { name: "Share Bob's Helper" })).toBeVisible();
  await page.getByTestId("share").click();
  await expect(page.getByText("Your AI is ready to use!")).toBeVisible({ timeout: 10_000 });
  const url = await page.getByTestId("public-url").inputValue();
  expect(url).toContain("/a/");
  await shot(page, "g6-shared");

  // The expert editor is still there for people who want it.
  await expect(page.getByTestId("advanced")).toBeVisible();

  // A visitor can open the link.
  const visitor = await context.browser()!.newContext();
  const pub = await visitor.newPage();
  await pub.goto(url);
  await expect(pub.getByText("Bob's Helper").first()).toBeVisible();
  await visitor.close();
});
