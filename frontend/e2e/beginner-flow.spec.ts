import { expect, test } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = async (page: any, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

test("a beginner goes from idea to a published agent", async ({ page, context }) => {
  const email = `beginner+${Date.now()}@example.com`;

  // 1. Create an account
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create account" }).click();

  // 2. Describe the agent
  await expect(page.getByText("What should your AI do?")).toBeVisible();
  await shot(page, "01-describe");
  await page.getByLabel("Describe your AI").fill(
    "Create an AI receptionist for my plumbing business that answers customer questions, reads my business documents, and collects booking requests."
  );
  await page.getByRole("button", { name: "Build my agent" }).click();

  // 3. Generated visual workflow + Architect explanation
  await expect(page.getByLabel("Agent name")).toHaveValue("Plumbing Receptionist", { timeout: 20_000 });
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.getByText("I built")).toBeVisible();
  await expect(page.getByText("Ollama isn't running")).toBeVisible(); // honest warning, no real model here
  await shot(page, "02-editor");

  // 4. Edit: switch the AI Model block to the labelled test mock provider
  await page.locator(".react-flow__node", { hasText: "AI brain" }).click();
  await page.getByLabel("Provider").selectOption("mock");
  await expect(page.getByTestId("save-state")).toHaveText(/Saved/, { timeout: 10_000 });

  // 5. Upload a document
  await page.getByRole("tab", { name: /Knowledge/ }).click();
  await page.getByTestId("doc-upload").setInputFiles({
    name: "business-info.txt", mimeType: "text/plain",
    buffer: Buffer.from("Opening hours: Monday to Friday, 7am to 6pm.\n\nEmergency call-outs are available 24/7 for burst pipes."),
  });
  await expect(page.getByText("business-info.txt").first()).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  // 6. Run a real test through the workflow engine
  await page.getByTestId("test-input").fill("What are your opening hours?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/\[TEST MOCK — not AI\] Reply to: What are your opening hours\?/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("business-info.txt").last()).toBeVisible();
  await shot(page, "03-test-run");

  // 7. Change it through the Architect, review the diff and apply
  await page.getByRole("tab", { name: /Architect/ }).click();
  await page.getByLabel("Message The Architect").fill("Add a condition that sends complicated questions for human review");
  await page.getByRole("button", { name: "Send", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Apply change" })).toBeVisible({ timeout: 10_000 });
  await shot(page, "04-architect-diff");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(7);

  // Undo and redo work
  await page.locator(".react-flow__pane").click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(page.getByTestId("save-state")).toHaveText(/Saved/, { timeout: 10_000 });

  // 8. Save a version and publish
  await page.getByRole("button", { name: "Save version" }).click();
  await page.getByTestId("publish-open").click();
  await page.getByTestId("publish-confirm").click();
  const url = await page.getByTestId("public-url").inputValue();
  expect(url).toContain("/a/");
  await shot(page, "05-published");

  // 9. A visitor uses the shareable link
  const visitor = await context.browser()!.newContext();
  const pub = await visitor.newPage();
  await pub.goto(url);
  await expect(pub.getByRole("heading", { name: "Plumbing Receptionist" })).toBeVisible();
  await pub.getByLabel("Your message").fill("Do you do emergency call-outs?");
  await pub.getByRole("button", { name: "Send" }).click();
  await expect(pub.getByText(/\[TEST MOCK — not AI\] Reply to: Do you do emergency call-outs\?/)).toBeVisible({ timeout: 20_000 });
  await shot(pub, "06-public-chat");
  await visitor.close();

  // 10. It shows on the dashboard with real numbers
  await page.goto("/dashboard");
  await expect(page.getByText("Live agents")).toBeVisible();
  await expect(page.getByRole("link", { name: "Plumbing Receptionist" }).first()).toBeVisible();
  await shot(page, "07-dashboard");
});
