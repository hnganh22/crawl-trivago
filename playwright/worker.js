const { parentPort } = require("worker_threads");
// const { chromium } = require("playwright");
const { parseHotel } = require("./src/parser");

parentPort.on("message", async (task) => {
  let browser = null;

  try {
    // browser = await chromium.launch({ headless: false });

    // const context = await browser.newContext({
    //   viewport: { width: 1280, height: 800 },
    //   userAgent:
    //     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    //     permisions:[],
    // });

    await context.addCookies([
      {
        name: "trivago_cookie_consent",
        value: "1",
        domain: ".trivago.vn",
        path: "/",
      },
      {
        name: "privacy_policy_accepted",
        value: "true",
        domain: ".trivago.vn",
        path: "/",
      }
    ]);

    const page = await context.newPage();

    let cleanUrl = task.url;
    if ((cleanUrl.match(/\?/g) || []).length > 1) {
      const firstIdx = cleanUrl.indexOf("?");
      cleanUrl =
        cleanUrl.substring(0, firstIdx + 1) +
        cleanUrl.substring(firstIdx + 1).replace(/\?/g, "&");
    }

    await page.goto(cleanUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.mouse.click(30, 300);
    await page.keyboard.press("Escape");


     for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(400);
    }
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(1000);

    await page.mouse.click(30, 300);
    await page.keyboard.press("Escape");


    
    const hotels = await parseHotel(page);
    parentPort.postMessage({ status: "success", data: hotels });
  } catch (error) {
    parentPort.postMessage({ status: "error", error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});


