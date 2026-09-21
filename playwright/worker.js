const { parentPort } = require("worker_threads");
const { parseHotel } = require("./src/parser");
const { getBrowser } = require("./browserManager");

parentPort.on("message", async (task) => {
  let browserInstance = null;

  try {
    const { browser, context, page } = await getBrowser();
    browserInstance = browser;

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
    if (browserInstance) await browserInstance.close();
  }
});


