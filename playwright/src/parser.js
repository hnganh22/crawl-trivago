
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function parseHotel(page) {
  await page.waitForSelector('li[data-testid="accommodation-list-element"]', { timeout: 10000 }).catch(() => {});
  const hotelElements = await page.locator('li[data-testid="accommodation-list-element"]').all();
  const hotels = [];

  for (const item of hotelElements) {
    await sleep(1000);

    try {
      const name = await item.locator('[data-testid="item-name-link"]').innerText().catch(() => null);
      console.log('Đang parse khách sạn:', name);
    
      if (!name) continue;

      const star = await item.locator('[data-testid="star-rating"] span').first().innerText().catch(() => null);
      const accomodationType = await item.locator('[data-testid="accommodation-type"]').innerText().catch(() => null);
      const ratingValue = await item.locator('[data-testid="rating-section"] [itemprop="ratingValue"]').first().innerText().catch(() => null);
      const ratingText = await item.locator('[data-testid="rating-section"] strong').innerText().catch(() => null);
      const reviewCount = await item.locator('[data-testid="rating-section"] span span').last().innerText().catch(() => null);
      const distanceLabel = await item.locator('[data-testid="distance-label-section"]').innerText().catch(() => null);

      const hotelId = await item.evaluate((el) => el.getAttribute("data-accommodation")).catch(() => null);
      const otaId = await item.locator('[data-advertiser]').first().getAttribute("data-advertiser").catch(() => null);
      const cheapestOta = await item.locator('[data-testid="advertiser-name"]').first().innerText().catch(() => null);
      const cheapestPrice = await item.locator('[data-testid="recommended-price"]').first().innerText().catch(() => null);

      let deals = [];

  
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(1000);

        
      const arrowBtn = item.locator('button[data-testid="additional-prices-slideout-entry-point"]').first();
      let arrowClicked = false;
      if (await arrowBtn.isVisible().catch(() => false)) {
        await arrowBtn.scrollIntoViewIfNeeded().catch(() => {});

        await arrowBtn.click({ force: true }).catch(() => {});
        arrowClicked = true;
      }

      if (!arrowClicked) {
        const priceContainer = page.locator('[data-fencing-trigger="item-card-price-slideout"]').first();
        await priceContainer.click({ force: true }).catch(() => {});
      }

      const slideout = page.locator('[data-testid="deals-slideout"]');
      const isOpened = await slideout.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false);

      if (isOpened) {
        await sleep(300);

        await slideout.evaluate((el) => {
          const bottomBtn = Array.from(el.querySelectorAll('button')).find(b => /Hiển thị tất cả giá/i.test(b.innerText));
          if (bottomBtn) {
            bottomBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
            bottomBtn.click();
          }
        }).catch(() => {});
        
        await sleep(500);

        const otaBlocks = await slideout.locator('li[data-testid="deal-list-item"]').all();

        for (const otaBlock of otaBlocks) {
          await otaBlock.evaluate((el) => {
            const showMoreOtaBtn = el.querySelector('button[data-testid="show-more-button"]');
            if (showMoreOtaBtn && !/hiển thị ít|thu gọn/i.test(showMoreOtaBtn.innerText)) {
              showMoreOtaBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
              showMoreOtaBtn.click();
            }
          }).catch(() => {});
          
          await sleep(300);
        }

      
        const dealSummaries = await slideout.locator('[data-testid="deal-summary"]').all();
    
        for (const d of dealSummaries) {
          const otaName = await d.locator('[data-testid="advertiser-name"]').first().innerText({timeout:2000}).catch(() => "N/A");
          const otaIdDeal = await d.getAttribute("data-advertiser").catch(() => null);
          const roomTitles = await d.locator('p[title]').evaluateAll(
          els => els.map(el => el.getAttribute('title')).filter(Boolean)
          ).catch(() => []);
          const rawRoom = roomTitles.reduce((max, cur) => cur.length > max.length ? cur : max, "");
          const room = String(rawRoom || "N/A").trim();
          console.log(`Đang parse deal: OTA=${otaName}, Room=${room}`);
          const priceText = await d.locator('[data-testid="recommended-price"]').innerText().catch(() => "N/A");
          const strikeText = await d.locator('[data-testid="strike-through-price"]').innerText().catch(() => null);
          const attrText = await d.locator('[data-testid="deal-attributes"]').innerText().catch(() => "");

          deals.push({
            otaId: otaIdDeal,
            ota: otaName.trim(),
            roomType: room,
            hasBreakfast: attrText.includes("Gồm bữa sáng"),
            originalPrice: strikeText ? strikeText.replace(/Giá cũ|\s|₫|\./gi, "").trim() : null,
            finalPrice: priceText.replace(/Giá thực tế|\s|₫|\./gi, "").trim(),
          });
        }

  
        const closeBtn = item.locator('button[data-testid="slideout-close"], button[data-testid="slideout-x-button"]').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.evaluate((b) => b.click()).catch(() => {});
        } else {
          await page.keyboard.press("Escape").catch(() => {});
        }
        await sleep(200);
      }

      hotels.push({
        hotelId,
        otaId,
        name: name.trim(),
        star,
        accomodationType,
        ratingValue,
        ratingText,
        reviewCount,
        distanceLabel,
        cheapestOta,
        cheapestPrice: cheapestPrice ? cheapestPrice.replace(/Giá thực tế|\s|₫|\./gi, "").trim() : null,
        deals,
      });
    } catch (error) {
      console.error("Lỗi parse hotel item:", error);
    }
  }

  return hotels;
}

module.exports = { parseHotel };



