import * as step from '@flow-step/step-toolkit';
import process from 'process';
import { getParams } from './params';
import { performESLintCheck, ESLintConfig } from './eslint';
import { performTypeScriptCheck } from './typescript';
import {
  performTypeScriptCoverageCheck,
  TypeScriptCoverageConfig
} from './typescript-coverage';
import { runUserScript } from './util';

async function runStep(): Promise<void> {
  const params = getParams();
  // 打印所有环境变量
  step.info('=== 环境变量 ===');
  Object.keys(process.env).forEach(key => {
    step.info(`${key}: ${process.env[key]}`);
  });

  // 进入项目目录
  process.chdir(params.projectDir);
  // 打印当前目录
  step.info(`=== 当前目录 ===\n${process.cwd()}`);

  // 从 params 对象获取环境变量，在业务逻辑中处理默认值
  const enableESLintCheck = params.enableESLintCheck === 'true';
  const enableTypeScriptCheck = params.enableTypeScriptCheck === 'true';
  const enableTypeScriptCoverageReport =
    params.enableTypeScriptCoverageReport === 'true';
  const envBranchDeployMode = params.envBranchDeployMode === 'true';

  // 处理检测分支：* 表示当前分支，空值时也使用当前分支
  let sourceBranch = params.sourceBranch || '*';
  if (sourceBranch === '*') {
    // * 表示当前分支，使用CI环境变量或空值（让git diff使用HEAD）
    sourceBranch = params.ciCommitRefName || params.gitBranch || '';
  }

  // 环境分支部署模式下，忽略source_branch的值
  if (envBranchDeployMode) {
    sourceBranch = '';
  }

  const targetBranch = params.targetBranch || 'master';
  const fullCheckMode = params.fullCheckMode === 'true';
  const fullTypeScriptCheckMode = params.fullTypeScriptCheckMode === 'true';
  const checkDirectoriesRaw = params.checkDirectories || 'src';
  const projectDir = params.projectDir || params.workSpace;
  const typeScriptCoverageThreshold = parseInt(
    params.typeScriptCoverageThreshold || '90'
  );

  try {
    // 执行用户自定义构建脚本
    step.info('=== 执行用户构建脚本 ===');
    await runUserScript(projectDir, params.userScript);
  } catch (error: any) {
    step.error(`用户构建脚本执行过程中发生错误: ${error.message}`);
    process.exit(1);
  }

  // 检查配置
  step.info('=== 代码检查配置 ===');

  // 处理检查目录配置（支持换行分隔）
  const checkDirectories = checkDirectoriesRaw
    .split(/[\n\r]+/)
    .map(dir => dir.trim())
    .filter(dir => dir.length > 0);

  step.info(`ESLint检测开关: ${enableESLintCheck}`);
  step.info(`TypeScript检测开关: ${enableTypeScriptCheck}`);
  step.info(`TypeScript覆盖率检测开关: ${enableTypeScriptCoverageReport}`);
  if (enableTypeScriptCoverageReport) {
    step.info(`TypeScript覆盖率阈值: ${typeScriptCoverageThreshold}%`);
  }
  step.info(`环境分支部署模式: ${envBranchDeployMode}`);
  step.info(
    `检测分支: ${
      params.sourceBranch === '*' || !params.sourceBranch
        ? '当前分支'
        : params.sourceBranch
    } ${sourceBranch ? `(${sourceBranch})` : '(HEAD)'}`
  );
  step.info(`目标分支: ${targetBranch}`);
  step.info(`ESLint检测模式: ${fullCheckMode ? '全量检测' : '增量检测'}`);
  step.info(
    `TypeScript检测模式: ${fullTypeScriptCheckMode ? '全量检测' : '增量检测'}`
  );
  step.info(`检查目录: ${checkDirectories.join(', ')}`);
  if (envBranchDeployMode) {
    step.info(`CI提交引用名: ${params.ciCommitRefName || '未设置'}`);
  }

  // 用于存储检查到的文件列表（ESLint和TypeScript可能需要相同的文件列表）
  let checkedFiles: string[] = [];

  // 用于收集所有检查结果
  let hasErrors = false;
  let totalErrors = 0;
  let totalWarnings = 0;
  const checkResults: string[] = [];

  // 执行 ESLint 检查
  if (enableESLintCheck) {
    step.info('开始执行 ESLint 检查...');

    const eslintConfig: ESLintConfig = {
      enableCheck: enableESLintCheck,
      sourceBranch: sourceBranch,
      targetBranch: targetBranch,
      fullCheckMode: fullCheckMode,
      workSpace: params.workSpace,
      projectDir: projectDir,
      checkDirectories: checkDirectories,
      envBranchDeployMode: envBranchDeployMode,
      ciCommitRefName: params.ciCommitRefName
    };

    try {
      const result = await performESLintCheck(eslintConfig);
      checkedFiles = result.checkedFiles; // 保存检查的文件列表

      if (result.success) {
        step.success(
          `ESLint 检查通过! 检查了 ${result.checkedFiles.length} 个文件`
        );
        if (result.warningCount > 0) {
          step.warning(`发现 ${result.warningCount} 个警告`);
        }
        checkResults.push(
          `ESLint: 通过 (${result.checkedFiles.length} 个文件, ${result.warningCount} 个警告)`
        );
      } else {
        step.error(
          `ESLint 检查失败! 发现 ${result.errorCount} 个错误, ${result.warningCount} 个警告`
        );
        if (result.checkedFiles.length > 0) {
          step.info(`检查的文件: ${result.checkedFiles.join(', ')}`);
        }
        hasErrors = true;
        totalErrors += result.errorCount;
        checkResults.push(
          `ESLint: 失败 (${result.errorCount} 个错误, ${result.warningCount} 个警告)`
        );
      }
      totalWarnings += result.warningCount;
    } catch (error: any) {
      step.error(`ESLint 检查过程中发生错误: ${error.message}`);
      hasErrors = true;
      checkResults.push(`ESLint: 执行错误 (${error.message})`);
    }
  } else {
    step.info('ESLint 检查已禁用，跳过检查');
    checkResults.push('ESLint: 已禁用');
  }

  // 执行 TypeScript 检查
  if (enableTypeScriptCheck) {
    step.info('开始执行 TypeScript 检查...');

    try {
      const result = await performTypeScriptCheck(
        projectDir,
        checkedFiles, // 传入ESLint检查的文件列表
        fullTypeScriptCheckMode,
        checkDirectories,
        sourceBranch,
        targetBranch
      );

      if (result.success) {
        if (result.checkedFiles === 0) {
          step.success('TypeScript 检查完成：没有需要检查的文件');
          checkResults.push('TypeScript: 通过 (没有需要检查的文件)');
        } else {
          const fileCountMsg =
            result.checkedFiles === -1
              ? '全量检查'
              : `检查了 ${result.checkedFiles} 个文件`;
          step.success(`TypeScript 检查通过! ${fileCountMsg}`);
          if (result.warningCount > 0) {
            step.warning(`发现 ${result.warningCount} 个警告`);
          }
          checkResults.push(
            `TypeScript: 通过 (${fileCountMsg}, ${result.warningCount} 个警告)`
          );
        }
      } else {
        const fileCountMsg =
          result.checkedFiles === -1
            ? '全量检查'
            : `检查了 ${result.checkedFiles} 个文件`;
        step.error(
          `TypeScript 检查失败! 发现 ${result.errorCount} 个错误${
            result.warningCount > 0 ? `, ${result.warningCount} 个警告` : ''
          } (${fileCountMsg})`
        );
        hasErrors = true;
        totalErrors += result.errorCount;
        checkResults.push(
          `TypeScript: 失败 (${result.errorCount} 个错误, ${result.warningCount} 个警告, ${fileCountMsg})`
        );
      }
      totalWarnings += result.warningCount;
    } catch (error: any) {
      step.error(`TypeScript 检查过程中发生错误: ${error.message}`);
      hasErrors = true;
      checkResults.push(`TypeScript: 执行错误 (${error.message})`);
    }
  } else {
    step.info('TypeScript 检查已禁用，跳过检查');
    checkResults.push('TypeScript: 已禁用');
  }

  // 执行 TypeScript 覆盖率检查
  if (enableTypeScriptCoverageReport) {
    step.info('开始执行 TypeScript 覆盖率检查...');

    const coverageConfig: TypeScriptCoverageConfig = {
      enableCheck: enableTypeScriptCoverageReport,
      threshold: typeScriptCoverageThreshold,
      projectDir: projectDir,
      workSpace: params.workSpace
    };

    try {
      const result = await performTypeScriptCoverageCheck(coverageConfig);

      if (result.success) {
        step.success(result.message);
        checkResults.push('TypeScript覆盖率: 通过');
      } else {
        step.error(result.message);
        hasErrors = true;
        checkResults.push('TypeScript覆盖率: 失败');
      }
    } catch (error: any) {
      step.error(`TypeScript 覆盖率检查过程中发生错误: ${error.message}`);
      hasErrors = true;
      checkResults.push(`TypeScript覆盖率: 执行错误 (${error.message})`);
    }
  } else {
    step.info('TypeScript 覆盖率检查已禁用，跳过检查');
    checkResults.push('TypeScript覆盖率: 已禁用');
  }

  // 输出最终检查结果汇总
  step.info('=== 代码检查结果汇总 ===');
  checkResults.forEach(result => {
    step.info(result);
  });

  if (hasErrors) {
    step.error(
      `代码检查失败! 总计发现 ${totalErrors} 个错误, ${totalWarnings} 个警告`
    );
    process.exit(1);
  } else {
    step.success(
      `代码检查通过! ${
        totalWarnings > 0 ? `发现 ${totalWarnings} 个警告` : '没有发现问题'
      }`
    );
  }
}

runStep()
  .then(function () {
    step.success('run step successfully!');
  })
  .catch(function (err: Error) {
    step.error(err.message);
    process.exit(-1);
  });
