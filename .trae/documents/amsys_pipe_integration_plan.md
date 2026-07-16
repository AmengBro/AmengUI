# amsys 管道模式集成计划

## 需求分析

当前应用启动流程中，`.app` 文件路径直接通过 `path.join(APP_ROOT, 'rootdir', ...)` 构建。需要改为使用 `amsys.exe` 的 `--pipe` 模式，通过 `to_windows` 命令将 Unix 风格路径 `/usr/share/applications` 转换为真实 Windows 路径，再访问 `.app` 文件。

## 关键改动

### 1. 创建 amsys 客户端模块

新建文件 `src/amsys/client.js`，封装 amsys 管道通信逻辑：
- 启动 amsys.exe --pipe 子进程
- 实现 request 方法发送命令
- 实现 toWindows、resolve、listDir 方法

### 2. 修改主进程应用启动逻辑

修改 `src/index.js`：
- 导入 amsys 客户端
- 在 `app:launch` 和 `app:getInfo` 中使用 `to_windows /usr/share/applications` 获取真实路径
- 将 `.app` 文件路径改为从 amsys 获取的 Windows 路径

## 实施步骤

### 步骤 1：创建 amsys 客户端

```javascript
// src/amsys/client.js
const { spawn, ChildProcess } = require('child_process');
const path = require('node:path');

class AmsysClient {
    private proc: ChildProcess;
    private queue: Array<{ resolve: (v: any) => void; reject: (e: any) => void }> = [];
    private buffer = '';

    constructor(amsysPath: string) {
        this.proc = spawn(amsysPath, ['--pipe'], { stdio: ['pipe', 'pipe', 'pipe'] });
        this.proc.stdout.on('data', (data) => {
            this.buffer += data.toString();
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                const q = this.queue.shift();
                if (q) q.resolve(JSON.parse(line));
            }
        });
        this.proc.on('error', (err) => {
            for (const q of this.queue) q.reject(err);
            this.queue = [];
        });
    }

    private request(cmd) {
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject });
            this.proc.stdin.write(cmd + '\n');
        });
    }

    toWindows(unixPath) {
        return this.request(`to_windows ${unixPath}`);
    }

    resolve(unixPath) {
        return this.request(`resolve ${unixPath}`);
    }

    listDir(unixPath) {
        return this.request(`list_dir ${unixPath}`);
    }

    close() {
        this.proc.kill();
    }
}

let instance = null;

function getAmsysClient(amsysPath) {
    if (!instance) {
        instance = new AmsysClient(amsysPath);
    }
    return instance;
}

module.exports = { AmsysClient, getAmsysClient };
```

### 步骤 2：修改 index.js 中的路径获取逻辑

在 `app:launch` 和 `app:getInfo` 中，将：
```javascript
const appPath = path.join(APP_ROOT, 'rootdir', 'usr', 'share', 'applications', `${appName}.app`);
```
改为：
```javascript
const { getAmsysClient } = require('./amsys/client');
const amsysClient = getAmsysClient(path.join(APP_ROOT, 'src', 'amsys', 'amsys.exe'));
const result = await amsysClient.toWindows('/usr/share/applications');
const appDir = result.winPath;
const appPath = path.join(appDir, `${appName}.app`);
```

## 风险评估

1. **amsys 启动失败**：需要添加错误处理，回退到直接路径构建
2. **路径转换失败**：需要处理 `to_windows` 返回错误的情况
3. **并发请求**：amsys 为串行处理，客户端已实现队列机制

## 测试计划

1. 启动应用后点击桌面图标，验证应用能正常启动
2. 验证 `.app` 文件路径通过 amsys 正确解析
3. 验证 amsys 不可用时的回退机制

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/amsys/client.js` | 新建 | amsys 管道客户端 |
| `src/index.js` | 修改 | 应用启动和获取信息逻辑 |

## 依赖关系

- amsys.exe 需位于 `src/amsys/amsys.exe`（已存在）
- Node.js child_process 模块（内置）