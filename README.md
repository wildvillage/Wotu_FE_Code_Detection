# Wotu_FE_Code_Detection

沃土前端代码检测 Flow 自定义步骤

## 项目简介

这是一个专为前端项目设计的代码质量检测工具，集成了 ESLint、TypeScript 检查和 TypeScript 覆盖率检测功能，支持增量检测和全量检测模式，特别针对 Git 分支工作流进行了优化。

## 核心功能

### 1. ESLint 代码检测
- **增量检测**: 只检测变更的文件，提高检测效率
- **全量检测**: 检测指定目录下的所有前端文件
- **智能文件过滤**: 自动识别 JS/TS/JSX/TSX/Vue 文件
- **详细报告**: 提供错误和警告的详细统计信息

### 2. TypeScript 类型检查
- **类型安全检测**: 确保 TypeScript 代码的类型正确性
- **增量/全量模式**: 支持两种检测模式（推荐使用全量检测）
- **编译错误检测**: 识别编译时错误和警告

### 3. TypeScript 覆盖率检查
- **类型覆盖率检测**: 检测 TypeScript 项目的类型覆盖率
- **自动依赖安装**: 自动安装 `typescript-coverage-report` 和 `semantic-ui-react`
- **配置自动化**: 自动在 `package.json` 中配置 `ts-coverage` 脚本和 `typeCoverage` 字段
- **包管理器适配**: 支持 pnpm/yarn/npm 等不同包管理器
- **阈值控制**: 可配置覆盖率阈值，低于阈值时检查失败
- **详细报告**: 提供覆盖率统计和未覆盖文件详情

### 4. 环境分支部署模式
- **智能分支检测**: 自动识别最近合并到部署分支的开发分支
- **精确变更追踪**: 使用 Git 命令准确定位文件变更范围
- **部署场景优化**: 专为环境部署场景设计的检测逻辑

### 5. 灵活配置
- **多目录支持**: 支持指定多个检查目录
- **分支配置**: 灵活配置源分支和目标分支
- **开关控制**: 独立控制各项检测功能的开启/关闭

## 配置说明

使用和接入文档[沃土前端CI静态代码检查工具接入文档](https://alidocs.dingtalk.com/i/nodes/G1DKw2zgV2R02zxKFQgK0xXGVB5r9YAn)

### 基础配置
- **构建命令**: 自定义构建脚本，默认使用 pnpm 安装依赖
- **检查目录**: 指定需要检查的文件夹，支持多目录配置

### ESLint 配置
- **是否开启ESLint检测**: 控制 ESLint 检查的开启/关闭
- **是否全量ESLint检测**: 选择增量或全量检测模式
- **检测分支**: 指定要检测的分支（* 表示当前分支）
- **目标分支**: 增量检测时的对比基准分支

### TypeScript 配置
- **是否开启TypeScript检测**: 控制 TypeScript 检查的开启/关闭
- **是否全量TypeScript检测**: 选择增量或全量检测模式

### TypeScript 覆盖率配置
- **是否开启TypeScript覆盖率检测**: 控制 TypeScript 覆盖率检查的开启/关闭
- **覆盖率阈值**: 设置最低覆盖率要求（百分比），低于此值检查失败
- **自动配置**: 工具会自动配置相关依赖和脚本，无需手动设置

### 环境分支部署模式
- **环境分支部署模式**: 启用后使用特殊的分支检测逻辑
- 适用于通过指定部署分支发布环境的场景
- 个人开发分支部署时请勿勾选

## 快速开始

### 安装依赖
```bash
npm install --registry=https://registry.npmmirror.com
```

### 运行测试
```bash
npm run test
```

### 构建项目
```bash
npm run build
```

### 本地运行
```bash
node dist/index.js
```

### 发布
```bash
npm run publish
```

## 项目结构

```
├── src/                        # 源代码目录
│   ├── index.ts               # 主入口文件
│   ├── eslint.ts              # ESLint 检测逻辑
│   ├── typescript.ts          # TypeScript 检测逻辑
│   ├── typescript-coverage.ts # TypeScript 覆盖率检测逻辑
│   ├── params.ts              # 参数处理
│   └── util.ts                # 工具函数
├── step.yaml                  # Flow 步骤配置文件
├── dist/                      # 构建输出目录
├── lib/                       # 编译后的 JS 文件
└── test/                      # 测试文件
```

## 使用场景

### 1. 持续集成 (CI)
在 CI/CD 流水线中自动执行代码质量检查，确保代码质量标准。

### 2. 分支合并检查
在分支合并前自动检测变更文件，避免引入代码质量问题。

### 3. 环境部署
在环境部署流程中检测即将部署的代码变更，确保部署安全。

### 4. TypeScript 项目质量保障
通过类型覆盖率检测，确保 TypeScript 项目的类型安全性和代码质量。

## 技术特性

- **基于 TypeScript**: 提供类型安全和更好的开发体验
- **Flow Step Toolkit**: 集成 Flow 平台的标准工具包
- **Git 集成**: 深度集成 Git 命令，精确识别文件变更
- **错误处理**: 完善的错误处理和日志记录机制
- **性能优化**: 增量检测模式大幅提升检测效率
- **包管理器兼容**: 支持 npm、yarn、pnpm 等主流包管理器
- **自动化配置**: 自动安装依赖和配置相关工具

## 依赖要求

- Node.js 环境
- Git 版本控制
- ESLint 配置文件 (.eslintrc.json)
- TypeScript 配置文件 (tsconfig.json) - TypeScript 相关检查需要

### 最新更新
- 新增 TypeScript 覆盖率检测功能
- 支持自动安装和配置 `typescript-coverage-report`
- 优化包管理器检测和命令执行逻辑
- 改进错误处理和日志输出

## 支持与反馈

如有问题或建议，请通过项目仓库提交 Issue 或 Pull Request。

项目仓库: https://github.com/wildvillage/Wotu_FE_Code_Detection
