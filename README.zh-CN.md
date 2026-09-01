# hexo-plugin-github-card

[English](./README.md)

[![CI](https://github.com/dong4j/hexo-plugin-github-card/actions/workflows/ci.yml/badge.svg)](https://github.com/dong4j/hexo-plugin-github-card/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Hexo](https://img.shields.io/badge/hexo-6%20%7C%207%20%7C%208-0e83cd?logo=hexo&logoColor=white)](https://hexo.io/)

将 Hexo 文章中独占一行的 GitHub 仓库 URL 自动渲染成响应式 Open Graph 预览卡片。不需要自定义标签语法，也不需要 GitHub Token。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/dong4j/hexo-plugin-github-card/main/docs/images/github-card-dark.png">
  <img src="https://raw.githubusercontent.com/dong4j/hexo-plugin-github-card/main/docs/images/github-card-light.png" alt="hexo-plugin-github-card 渲染的 GitHub 仓库预览卡片">
</picture>

## 功能

- Markdown 保持可移植：只需要独占一行书写普通仓库 URL。
- 在生成阶段读取 GitHub 的 `og:title`、`og:description` 和 `og:image`。
- 只转换仓库首页；行内链接、Issue、PR、Release 和文件地址保持原样。
- 本地缓存元数据，减少 Hexo 重复生成时的 GitHub 请求。
- 请求失败时优先使用过期缓存；没有缓存时保留原始链接。
- 自带亮色、暗色、移动端、键盘焦点和减少动画样式。
- 将构建期元数据请求严格限制在 `github.com` 仓库地址。

## 安装

在首次 npm 发布之前，请直接从 GitHub 安装：

```bash
npm install --save github:dong4j/hexo-plugin-github-card
```

Hexo 会自动加载包名以 `hexo-` 开头的插件。

## 使用

在文章中独占一行书写 GitHub 仓库 URL：

```markdown
https://github.com/starcat-app/Starcat
```

可见文本必须与仓库 URL 相同。自定义文本或行内链接不会转换：

```markdown
安装前请先阅读 [Starcat 文档](https://github.com/starcat-app/Starcat)。
```

可以通过文章 front matter 单独关闭转换：

```yaml
github_card: false
```

## 配置

在 Hexo `_config.yml` 中添加：

```yaml
github_card:
  enable: true
  # 元数据缓存有效期，单位为秒；默认 7 天。
  cache_ttl: 604800
  # 单次 GitHub Open Graph 请求超时，单位为秒。
  timeout: 8
```

元数据缓存位置：

```text
node_modules/.cache/hexo-plugin-github-card/metadata.json
```

## 工作原理

插件在 Markdown 渲染完成后检查段落片段。只有当一个段落中恰好包含一个链接，并且链接文本与目标地址都是同一个 `github.com/{owner}/{repository}` URL 时，才会转换为卡片。

每个匹配仓库会依次执行：

1. 检查本地元数据缓存；
2. 缓存不存在或过期时，请求公开的 GitHub 仓库页面；
3. 提取 Open Graph 标题、简介和社交预览图；
4. 生成可访问的仓库卡片，并注册共享样式资源。

同一次生成中的重复请求会自动合并。缓存刷新失败时仍可使用过期数据；没有缓存时会原样保留链接，因此网络故障不会阻断 Hexo 构建。

## 范围与安全

元数据抓取器只接受 `github.com` 域名、且路径恰好包含两段的 HTTP(S) URL。GitHub 产品入口和仓库内部地址都会被拒绝，避免构建期抓取器被用作任意 URL 请求入口。

Open Graph 文本在输出前会进行 HTML 转义，图片地址必须使用 HTTP 或 HTTPS。

## 兼容性

| 组件 | 支持版本 |
| --- | --- |
| Node.js | `>=18.17` |
| Hexo | `6.x`、`7.x`、`8.x` |
| 浏览器 | 支持 CSS Grid 的现代浏览器 |

## 开发

```bash
npm install
npm test
npm pack --dry-run
```

测试覆盖仓库 URL 校验、裸链接识别、安全 HTML 输出、Open Graph 提取、缓存新鲜度、离线回退和 Hexo 扩展注册。

## 参与贡献

提交 Pull Request 前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。安全问题请按照 [SECURITY.md](./SECURITY.md) 报告。

## 致谢

实现参考了以下 MIT 开源项目的思路：

- [hexo-tag-ogp-link-preview](https://github.com/h-sugawara/hexo-tag-ogp-link-preview)：构建期 Open Graph 预览。
- [remark-link-card-plus](https://github.com/okaryo/remark-link-card-plus)：独立裸链接转换语义。
- [open-graph-scraper](https://github.com/jshemas/openGraphScraper)：Open Graph 元数据解析。

## 许可证

[MIT](./LICENSE) © 2026 dong4j
