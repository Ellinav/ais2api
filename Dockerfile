# Dockerfile (多架构支持版)
FROM node:18-slim
WORKDIR /app

# 1. 安装系统依赖，支持多架构
RUN apt-get update && apt-get install -y \
    curl unzip\
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxrandr2 libxss1 libxtst6 xvfb \
    && rm -rf /var/lib/apt/lists/*

# 2. [保持不变] 拷贝 package.json 并安装依赖。
# 只要你的npm包不变化，这一层就会被缓存。
COPY package*.json ./
RUN npm install --production

# 3. 【核心优化】将浏览器下载和解压作为独立的一层。
# 根据目标架构下载对应的Camoufox版本
ARG TARGETPLATFORM
ARG CAMOUFOX_AMD64_URL
ARG CAMOUFOX_ARM64_URL
ARG CAMOUFOX_VERSION

RUN set -eux; \
    echo "=== 多架构构建信息 ===" && \
    echo "目标平台: ${TARGETPLATFORM}" && \
    echo "AMD64 URL: ${CAMOUFOX_AMD64_URL}" && \
    echo "ARM64 URL: ${CAMOUFOX_ARM64_URL}" && \
    echo "版本: ${CAMOUFOX_VERSION}" && \
    echo "======================" && \
    \
    case "${TARGETPLATFORM}" in \
        "linux/amd64") \
            echo ">>> [AMD64] 开始下载 Camoufox..." && \
            DOWNLOAD_URL="${CAMOUFOX_AMD64_URL}" \
            ;; \
        "linux/arm64") \
            echo ">>> [ARM64] 开始下载 Camoufox..." && \
            DOWNLOAD_URL="${CAMOUFOX_ARM64_URL}" \
            ;; \
        *) \
            echo "!!! 错误: 不支持的架构 ${TARGETPLATFORM}" >&2 && \
            exit 1 \
            ;; \
    esac && \
    \
    echo ">>> 下载地址: ${DOWNLOAD_URL}" && \
    curl -fSL --retry 3 --retry-delay 2 "${DOWNLOAD_URL}" -o camoufox.zip && \
    \
    echo ">>> 下载完成，文件大小: $(du -h camoufox.zip | cut -f1)" && \
    echo ">>> 验证文件..." && \
    [ -f camoufox.zip ] || (echo "!!! 文件不存在" >&2 && exit 1) && \
    [ -s camoufox.zip ] || (echo "!!! 文件为空" >&2 && exit 1) && \
    \
    echo ">>> 检查文件类型..." && \
    file camoufox.zip && \
    echo ">>> ZIP 文件详细信息:" && \
    ls -la camoufox.zip && \
    echo ">>> ZIP 文件完整性测试..." && \
    unzip -t camoufox.zip || (echo "!!! ZIP 文件损坏" >&2 && exit 1) && \
    echo ">>> 查看 ZIP 内容列表..." && \
    unzip -l camoufox.zip && \
    echo ">>> 检查是否有特殊字符文件名..." && \
    unzip -l camoufox.zip | grep -E '[^[:print:][:space:]]' || echo "未发现非打印字符" && \
    echo ">>> 尝试详细解压并显示每个文件..." && \
    unzip -v camoufox.zip && \
    echo ">>> 开始解压 Camoufox..." && \
    unzip -o camoufox.zip 2>&1 | tee unzip.log || (echo "!!! 解压失败，显示详细信息:" >&2 && cat unzip.log && ls -la && file camoufox.zip && exit 1) && \
    echo ">>> 解压完成，检查解压日志..." && \
    [ -f unzip.log ] && cat unzip.log || echo "无解压日志文件" && \
    \
    echo ">>> 当前目录内容:" && \
    ls -lah && \
    \
    echo ">>> 查找 camoufox 可执行文件..." && \
    CAMOUFOX_BIN=$(find . -name "camoufox" -type f | head -n 1) && \
    [ -n "${CAMOUFOX_BIN}" ] || (echo "!!! 未找到 camoufox" >&2 && exit 1) && \
    echo ">>> 找到: ${CAMOUFOX_BIN}" && \
    \
    echo ">>> 设置可执行权限..." && \
    chmod +x "${CAMOUFOX_BIN}" && \
    \
    echo ">>> 清理临时文件..." && \
    rm -rf camoufox.zip && \
    \
    echo ">>> 最终目录结构:" && \
    ls -lah . && \
    \
    echo ">>> ✓ Camoufox 安装完成 (${TARGETPLATFORM})"

# 4. 【核心优化】现在，才拷贝你经常变动的代码文件。
# 这一步放在后面，确保你修改代码时，前面所有重量级的层都能利用缓存。
COPY unified-server.js black-browser.js models.json ./

# 5. [保持不变] 创建目录并设置权限。
# 注意：chown应在拷贝文件后进行，确保所有文件权限正确。
RUN mkdir -p ./auth && chown -R node:node /app

# 切换到非 root 用户
USER node

# 暴露服务端口
EXPOSE 7860
EXPOSE 9998

# 设置环境变量
ENV CAMOUFOX_EXECUTABLE_PATH=/app/camoufox

# 定义容器启动命令
CMD ["node", "unified-server.js"]
