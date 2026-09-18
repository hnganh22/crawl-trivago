// index.js
const { startCrawler } = require('./src/crawler');
(async () => {
  console.log('--- KHỞI ĐỘNG HỆ THỐNG CRAWLER TRIVAGO ---');
  await startCrawler();
})();