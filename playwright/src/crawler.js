const { Worker } = require("worker_threads");
const path = require("path");
const { getUrls, saveHotelResults, closePool } = require("../config/db");

const MAX_WORKERS = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runWorkerTask(task) {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, "..", "worker.js"));

    worker.on("message", async (message) => {
      if (message.status === "success" && message.data?.length > 0) {
        await saveHotelResults(task, message.data).catch((err) =>
          console.error(`[DB ERROR] Task ID ${task.id}:`, err.message),
        );
        resolve(message.data);
      } else {
        console.error(
          `[ERROR] Task ID ${task.id}: ${message.error || "Không có dữ liệu"}`,
        );
        resolve([]);
      }
      worker.terminate();
    });

    worker.on("error", (err) => {
      console.error(`[WORKER CRASH] Task ID ${task.id}:`, err.message);
      resolve([]);
      worker.terminate();
    });

    worker.postMessage(task);
  });
}

async function runWithConcurrency(tasks, limit) {
  const results = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit);

    const batchResults = await Promise.all(
      batch.map((task) => runWorkerTask(task)),
    );
    results.push(...batchResults.flat());

    // Sleep 1.5 giây
    if (i + limit < tasks.length) await sleep(1500);
  }
  return results;
}

async function startCrawler() {
  try {
    const tasks = await getUrls(10);
    if (tasks.length === 0) {
      return;
    }

    const totalHotels = await runWithConcurrency(tasks, MAX_WORKERS);
  } catch (error) {
    console.error("Lỗi tiến trình crawler:", error.message);
  } finally {
    await closePool();
  }
}

module.exports = { startCrawler };
