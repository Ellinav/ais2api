const { firefox } = require("playwright");
const fs = require("fs");
const path = require("path");

// --- 配置常量 ---
const browserExecutablePath = path.join(__dirname, "camoufox", "camoufox.exe");
const VALIDATION_LINE_THRESHOLD = 200; // 定义验证的行数阈值
const AUTH_DIR = "auth"; // 格式化认证文件的文件夹
const SINGLE_LINE_AUTH_DIR = "single-line-auth"; // 单行认证文件的文件夹

/**
 * 确保指定的目录存在，如果不存在则创建它。
 * @param {string} dirPath - 要检查和创建的目录的路径。
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`📂 目录 "${path.basename(dirPath)}" 不存在，正在创建...`);
    fs.mkdirSync(dirPath);
  }
}

/**
 * 从 'auth' 目录中获取下一个可用的认证文件索引。
 * @returns {number} - 下一个可用的索引值。
 */
function getNextAuthIndex() {
  const directory = path.join(__dirname, AUTH_DIR);

  if (!fs.existsSync(directory)) {
    return 1;
  }

  const files = fs.readdirSync(directory);
  const authRegex = /^auth-(\d+)\.json$/;

  let maxIndex = 0;
  files.forEach((file) => {
    const match = file.match(authRegex);
    if (match) {
      const currentIndex = parseInt(match[1], 10);
      if (currentIndex > maxIndex) {
        maxIndex = currentIndex;
      }
    }
  });
  return maxIndex + 1;
}

(async () => {
  const authDirPath = path.join(__dirname, AUTH_DIR);
  const singleLineAuthDirPath = path.join(__dirname, SINGLE_LINE_AUTH_DIR);
  ensureDirectoryExists(authDirPath);
  ensureDirectoryExists(singleLineAuthDirPath);

  const newIndex = getNextAuthIndex();
  const newAuthFileName = `auth-${newIndex}.json`;
  const newSingleLineAuthFileName = `auth-single-${newIndex}.json`;

  console.log(`▶️  准备为账户 #${newIndex} 创建新的认证文件...`);
  console.log(`▶️  启动浏览器: ${browserExecutablePath}`);

  const browser = await firefox.launch({
    headless: false,
    executablePath: browserExecutablePath,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("\n--- 请在新打开的 Camoufox 窗口中完成以下操作 ---");
  console.log(
    "1. 浏览器将打开 Google AI Studio，请在弹出的页面中【完全登录】您的Google账户。"
  );
  console.log("2. 登录成功并看到 AI Studio 界面后，请不要关闭浏览器窗口。");
  console.log('3. 回到这个终端，然后按 "Enter" 键继续...');

  // <<< 这是唯一的修改点：已更新为 Google AI Studio 地址 >>>
  await page.goto("https://aistudio.google.com/u/0/prompts/new_chat");

  await new Promise((resolve) => process.stdin.once("data", resolve));

  // ==================== 抓取账户名 ====================

  let accountName = "unknown"; // 默认值
  try {
    console.log("🕵️  正在尝试获取账户名 (V3 - 扫描 <script> JSON)...");

    // 1. 定位所有 <script type="application/json"> 标签
    const scriptLocators = page.locator('script[type="application/json"]');
    const count = await scriptLocators.count();
    console.log(`   -> 找到了 ${count} 个 JSON <script> 标签。`);

    // 2. 定义一个基础的 Email 正则表达式
    // 它会匹配 "ouyang5453@gmail.com" 这样的字符串
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

    // 3. 遍历所有标签，寻找第一个匹配的 Email
    for (let i = 0; i < count; i++) {
      const content = await scriptLocators.nth(i).textContent();

      if (content) {
        // 4. 在标签内容中查找 Email
        const match = content.match(emailRegex);

        if (match && match[0]) {
          // 5. 找到了！
          accountName = match[0];
          console.log(`   -> 成功获取账户: ${accountName}`);
          break; // 找到后立即退出循环
        }
      }
    }

    if (accountName === "unknown") {
      console.log(
        `   -> 遍历了所有 ${count} 个 <script> 标签，但未找到 Email。`
      );
    }
  } catch (error) {
    console.warn(`⚠️  无法自动获取账户名 (V3 扫描时出错)。`);
    console.warn(`   -> 错误: ${error.message}`);
    console.warn(`   -> 将使用 "unknown" 作为账户名。`);
  }

  // ==================== 智能验证与双文件保存逻辑 ====================
  console.log("\n正在获取并验证登录状态...");
  const currentState = await context.storageState();
  currentState.accountName = accountName;
  const prettyStateString = JSON.stringify(currentState, null, 2);
  const lineCount = prettyStateString.split("\n").length;

  if (lineCount > VALIDATION_LINE_THRESHOLD) {
    console.log(
      `✅ 状态验证通过 (${lineCount} 行 > ${VALIDATION_LINE_THRESHOLD} 行).`
    );

    const singleLineStateString = JSON.stringify(currentState);
    const prettyAuthFilePath = path.join(authDirPath, newAuthFileName);
    const singleLineAuthFilePath = path.join(
      singleLineAuthDirPath,
      newSingleLineAuthFileName
    );

    fs.writeFileSync(prettyAuthFilePath, prettyStateString);
    console.log(
      `   📄 格式化文件已保存到: ${path.join(AUTH_DIR, newAuthFileName)}`
    );

    fs.writeFileSync(singleLineAuthFilePath, singleLineStateString);
    console.log(
      `    compressed -> 压缩文件已保存到: ${path.join(
        SINGLE_LINE_AUTH_DIR,
        newSingleLineAuthFileName
      )}`
    );
  } else {
    console.log(
      `❌ 状态验证失败 (${lineCount} 行 <= ${VALIDATION_LINE_THRESHOLD} 行).`
    );
    console.log("   登录状态似乎为空或无效，文件未被保存。");
    console.log("   请确保您已完全登录账户后再按回车。");
  }
  // ===================================================================

  await browser.close();
  console.log("\n浏览器已关闭。");

  process.exit(0);
})();
