import * as fs from 'fs';
import * as path from 'path';
import * as step from '@flow-step/step-toolkit';
import { execa } from 'execa';

/**
 * 执行用户自定义构建脚本
 */
export async function runUserScript(
  projectDir: string,
  userScript?: string
): Promise<void> {
  // 如果没有提供用户脚本，则跳过执行
  if (!userScript || userScript.trim() === '') {
    step.info('未提供用户构建脚本，跳过执行');
    return;
  }

  step.info('开始执行用户自定义构建脚本...');
  step.info(`项目目录: ${projectDir}`);
  step.info(`构建脚本: ${userScript}`);

  const startTime = Date.now();

  try {
    // 直接执行用户自定义构建脚本
    await execa(userScript, {
      cwd: projectDir,
      shell: true,
      encoding: 'utf8'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    step.success(`用户构建脚本执行完成，耗时 ${duration}s`);
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    step.error(`用户构建脚本执行失败，耗时 ${duration}s`);
    throw error;
  }
}

/**
 * 安装项目依赖（保留原有逻辑作为备用）
 */
export async function installDependencies(
  projectDir: string
): Promise<void> {
  step.info('开始安装项目依赖...');
  step.info(`项目目录: ${projectDir}`);

  // 检查是否存在 package.json
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    step.warning('未找到 package.json 文件，跳过依赖安装');
    throw new Error('未找到 package.json 文件');
  }

  // 检查是否存在 package-lock.json 或 yarn.lock
  const hasPackageLock = fs.existsSync(
    path.join(projectDir, 'package-lock.json')
  );
  const hasYarnLock = fs.existsSync(path.join(projectDir, 'yarn.lock'));
  const hasPnpmLock = fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'));

  let installCommand: string;
  if (hasPnpmLock) {
    installCommand = 'pnpm install';
    step.info('检测到 pnpm-lock.yaml，使用 pnpm 安装依赖');
  } else if (hasYarnLock) {
    installCommand = 'yarn install';
    step.info('检测到 yarn.lock，使用 yarn 安装依赖');
  } else {
    installCommand = 'npm install';
    step.info('使用 npm 安装依赖');
  }

  // 执行安装命令
  step.info(`执行命令: ${installCommand}`);
  const startTime = Date.now();

  try {
    // 清理 npm 缓存
    await execa('npm', ['cache', 'clean', '--force'], {
      cwd: projectDir
    });

    // 执行安装命令
    await execa(installCommand, {
      cwd: projectDir,
      shell: true,
      encoding: 'utf8'
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    step.success(`依赖安装完成，耗时 ${duration}s`);
  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    step.error(`依赖安装失败，耗时 ${duration}s`);
    throw error;
  }
}
