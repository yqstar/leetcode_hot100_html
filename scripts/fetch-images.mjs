import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const problems = JSON.parse(await readFile(new URL("../src/problems.json", import.meta.url), "utf8"));
const urls = new Set();
for (const problem of problems) {
  for (const match of problem.content.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) {
    let url = match[1].replaceAll("&amp;", "&");
    if (url.startsWith("//")) url = `https:${url}`;
    if (/^https?:\/\//.test(url)) urls.add(url);
  }
}

const outputDirectory = new URL("../.cache/images/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const manifest = {};
const queue = [...urls];

async function worker() {
  while (queue.length) {
    const url = queue.shift();
    try {
      const response = await fetch(url, {
        headers: {
          referer: "https://leetcode.cn/",
          "user-agent": "Mozilla/5.0 Codex Offline Study Builder",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type")?.split(";")[0] || "image/png";
      const filename = `${createHash("sha256").update(url).digest("hex")}.bin`;
      await writeFile(new URL(filename, outputDirectory), buffer);
      manifest[url] = { filename, contentType, size: buffer.length };
      console.log(`OK ${buffer.length.toString().padStart(8)} ${url}`);
    } catch (error) {
      manifest[url] = { error: String(error) };
      console.error(`FAIL ${url} ${error}`);
    }
  }
}

await Promise.all(Array.from({ length: 6 }, () => worker()));
await writeFile(new URL("manifest.json", outputDirectory), `${JSON.stringify(manifest, null, 2)}\n`);
const succeeded = Object.values(manifest).filter((entry) => !entry.error);
console.log(`完成：${succeeded.length}/${urls.size}，图片总计 ${succeeded.reduce((sum, entry) => sum + entry.size, 0)} 字节`);
