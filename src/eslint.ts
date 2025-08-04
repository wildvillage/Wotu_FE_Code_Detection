import * as path from 'path';
import * as fs from 'fs';
import * as step from '@flow-step/step-toolkit';
import { simpleGit } from 'simple-git';
import { execa } from 'execa';

export interface ESLintConfig {
  enableCheck: boolean;
  sourceBranch: string;
  targetBranch: string;
  fullCheckMode: boolean;
  workSpace: string;
  projectDir: string;
  checkDirectories: string[];
  envBranchDeployMode: boolean;
  ciCommitRefName?: string;
}

export interface ESLintResult {
  success: boolean;
  checkedFiles: string[];
  errorCount: number;
  warningCount: number;
  output: string;
}

/**
 * 环境分支部署模式下获取变更文件列表
 * 通过最近一次合并的开发分支相对于主分支的变更
 */
async function getEnvBranchChangedFiles(config: ESLintConfig): Promise<string[]> {
  try {
    const { projectDir, targetBranch, ciCommitRefName } = config;
    
    // 使用CI_COMMIT_REF_NAME作为当前部署分支，默认为develop
    const deployBranch = ciCommitRefName || 'develop';
    const masterBranch = targetBranch || 'master';
    const originMasterBranch = `origin/${masterBranch}`;
    
    step.info(`环境分支部署模式: 部署分支=${deployBranch}, 主分支=${masterBranch}`);
    
    const git = simpleGit(projectDir);
    
    // 1. 获取部署分支最近一次合并的提交
    try {
      const log = await git.log(['--merges', '--first-parent', deployBranch, '-n', '1']);
      if (!log.latest) {
        step.warning('未找到合并提交，使用常规增量检测');
        return await getChangedFiles(config);
      }
      
      const mergeCommit = log.latest.hash;
      step.info(`找到合并提交: ${mergeCommit}`);
      
      // 2. 提取被合并的开发分支末端提交
      const show = await git.show([mergeCommit, '--pretty=format:%P']);
      const parents = show.split(' ').filter(p => p.trim());
      
      if (parents.length < 2) {
        step.warning('合并提交格式异常，使用常规增量检测');
        return await getChangedFiles(config);
      }
      
      const devEnd = parents[1]; // 第二个父提交是被合并的分支末端
      step.info(`开发分支末端提交: ${devEnd}`);
      
      // 验证提交是否存在
      try {
        await git.catFile(['-e', devEnd]);
      } catch (error) {
        step.error(`提交 ${devEnd} 不存在，使用常规增量检测`);
        return await getChangedFiles(config);
      }
      
      // 3. 找到开发分支最初从主分支切出的点
      const initialBase = await git.raw(['merge-base', originMasterBranch, devEnd]);
      const baseCommit = initialBase.trim();
      step.info(`分支分叉点: ${baseCommit}`);
      
      // 4. 获取开发分支相对于主分支的完整变更文件
      const diff = await git.diff(['--name-only', baseCommit, devEnd]);
      const files = diff
        .trim()
        .split('\n')
        .filter(file => file.length > 0);
      
      step.info(`环境分支部署模式发现 ${files.length} 个变更文件`);
      
      return files;
    } catch (error: any) {
      step.error(`环境分支部署模式获取变更文件失败: ${error.message}`);
      step.warning('回退到常规增量检测模式');
      return await getChangedFiles(config);
    }
  } catch (error: any) {
    step.error(`环境分支部署模式初始化失败: ${error.message}`);
    return [];
  }
}

/**
 * 获取变更文件列表
 */
async function getChangedFiles(config: ESLintConfig): Promise<string[]> {
  try {
    const { projectDir, sourceBranch, targetBranch } = config;
    
    step.info(`获取变更文件: ${sourceBranch} -> ${targetBranch}`);
    
    const git = simpleGit(projectDir);
    
    // 获取远程分支最新状态
    await git.fetch();
    
    // 获取两个分支之间的差异文件
    const diff = await git.diff(['--name-only', `origin/${targetBranch}`, `origin/${sourceBranch}`]);
    const files = diff
      .trim()
      .split('\n')
      .filter((file: string) => file.length > 0);
    
    step.info(`发现 ${files.length} 个变更文件`);
    
    return files;
  } catch (error: any) {
    step.error(`获取变更文件失败: ${error.message}`);
    return [];
  }
}

/**
 * 过滤前端文件并验证存在性
 */
function filterFrontendFiles(
  files: string[],
  projectDir: string,
  checkDirectories: string[]
): string[] {
  const frontendExtensions = ['.js', '.ts', '.jsx', '.tsx', '.vue'];

  return files
    .filter(file => {
      // 只处理前端文件
      return frontendExtensions.some(ext => file.endsWith(ext));
    })
    .filter(file => {
      // 检查文件是否在指定的检查目录中
      const isInCheckDirectory = checkDirectories.some(dir => {
        const normalizedDir = dir.trim();
        return (
          file.startsWith(normalizedDir + '/') ||
          file.startsWith(normalizedDir + '\\')
        );
      });

      if (!isInCheckDirectory) {
        step.info(`跳过不在检查目录中的文件: ${file}`);
        return false;
      }

      return true;
    })
    .filter(file => {
      // 检查文件是否存在（排除已删除的文件）
      const fullPath = path.join(projectDir, file);
      const exists = fs.existsSync(fullPath);
      if (!exists) {
        step.info(`跳过已删除的文件: ${file}`);
      }
      return exists;
    });
}

/**
 * 获取全量检查的文件列表
 */
function getFullCheckFiles(
  checkDirectories: string[]
): string[] {
  const extensions = ['*.js', '*.ts', '*.jsx', '*.tsx', '*.vue'];
  const patterns: string[] = [];

  checkDirectories.forEach(dir => {
    const normalizedDir = dir.trim();
    extensions.forEach(ext => {
      patterns.push(`${normalizedDir}/**/${ext}`);
    });
  });

  step.info(`全量检查模式，检查目录: ${checkDirectories.join(', ')}`);
  step.info(`文件模式: ${patterns.join(', ')}`);

  return patterns;
}

/**
 * 执行ESLint检查
 */
async function runESLintCheck(
  files: string[],
  projectDir: string,
  isFullCheck: boolean
): Promise<ESLintResult> {
  try {
    let eslintCommand: string;

    if (isFullCheck) {
      // 全量检查模式
      eslintCommand = 'npx eslint . --format=compact';
      step.info('开始全量ESLint检查');
    } else {
      // 增量检查模式
      if (files.length === 0) {
        return {
          success: true,
          checkedFiles: [],
          errorCount: 0,
          warningCount: 0,
          output: '没有需要检查的文件'
        };
      }

      const fileArgs = files.map(file => `"${file}"`).join(' ');
      eslintCommand = `npx eslint ${fileArgs} --format=compact`;
      step.info(`开始对 ${files.length} 个变更文件进行ESLint检查`);
    }

    // 显示检查的文件
    files.forEach(file => step.info(`  - ${file}`));

    const result = await execa(eslintCommand, {
      cwd: projectDir,
      encoding: 'utf8',
      shell: true
    });

    return {
      success: true,
      checkedFiles: files,
      errorCount: 0,
      warningCount: 0,
      output: result.stdout || 'ESLint检查通过'
    };
  } catch (error: any) {
    // ESLint发现问题时会抛出异常
    const output = error.stdout || error.message;
    const lines = output.split('\n');

    // 解析错误和警告数量
    let errorCount = 0;
    let warningCount = 0;

    lines.forEach((line: string) => {
      // ESLint compact格式: file: line X, col Y, Error/Warning - message (rule)
      if (line.trim()) {
        // 匹配 "Error -" 模式
        if (/:\s*line\s+\d+,\s*col\s+\d+,\s*Error\s*-/.test(line)) {
          errorCount++;
        }
        // 匹配 "Warning -" 模式
        else if (/:\s*line\s+\d+,\s*col\s+\d+,\s*Warning\s*-/.test(line)) {
          warningCount++;
        }
      }
    });

    // 如果没有通过正则匹配到，尝试从详细输出中重新统计
    if (errorCount === 0 && warningCount === 0) {
      lines.forEach((line: string) => {
        if (line.includes('Error -')) errorCount++;
        if (line.includes('Warning -')) warningCount++;
      });
    }

    // 优化输出格式，去除PROJECT_DIR前缀
    const cleanedOutput = output.replace(new RegExp(projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '.');

    return {
      success: errorCount === 0, // 只有当没有错误时才算成功，警告不影响成功状态
      checkedFiles: files,
      errorCount,
      warningCount,
      output: cleanedOutput
    };
  }
}



/**
 * 检查ESLint配置文件是否存在
 */
function checkESLintConfig(projectDir: string): boolean {
  const configFiles = [
    '.eslintrc.js',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js'
  ];

  for (const configFile of configFiles) {
    if (fs.existsSync(path.join(projectDir, configFile))) {
      step.info(`找到ESLint配置文件: ${configFile}`);
      return true;
    }
  }

  step.warning('未找到ESLint配置文件，将使用默认配置');
  return false;
}

/**
 * 主要的ESLint检查函数
 */
export async function performESLintCheck(
  config: ESLintConfig
): Promise<ESLintResult> {
  const {
    enableCheck,
    fullCheckMode,
    projectDir,
    checkDirectories
  } = config;

  // 检查是否启用ESLint检查
  if (!enableCheck) {
    step.info('ESLint检查已禁用，跳过检查');
    return {
      success: true,
      checkedFiles: [],
      errorCount: 0,
      warningCount: 0,
      output: 'ESLint检查已禁用'
    };
  }

  // 检查是否在git仓库中
  try {
    await execa('git', ['rev-parse', '--git-dir'], {
      cwd: projectDir
    });
  } catch (error) {
    throw new Error('当前目录不是git仓库，无法进行增量检查');
  }

  // 检查ESLint配置
  step.info('=== 检查ESLint配置 ===');
  checkESLintConfig(config.projectDir);

  // 显示检查目录信息
  step.info(`检查目录: ${checkDirectories.join(', ')}`);

  let filesToCheck: string[];

  if (fullCheckMode) {
    // 全量检查
    filesToCheck = getFullCheckFiles(checkDirectories);
    step.info('执行全量ESLint检查');
  } else {
    // 增量检查
    step.info('执行增量ESLint检查');
    
    let changedFiles: string[];
    if (config.envBranchDeployMode) {
      // 环境分支部署模式
      step.info('使用环境分支部署模式获取变更文件');
      changedFiles = await getEnvBranchChangedFiles(config);
    } else {
      // 常规增量检测模式
      changedFiles = await getChangedFiles(config);
    }
    
    filesToCheck = filterFrontendFiles(
      changedFiles,
      config.projectDir,
      checkDirectories
    );

    if (filesToCheck.length === 0) {
      step.info('没有发现前端代码变更，跳过ESLint检查');
      return {
        success: true,
        checkedFiles: [],
        errorCount: 0,
        warningCount: 0,
        output: '没有前端代码变更'
      };
    }
  }

  // 执行ESLint检查
  step.info('=== 执行ESLint检查 ===');
  const result = await runESLintCheck(filesToCheck, config.projectDir, fullCheckMode);

  // 输出结果
  if (result.success) {
    if (result.errorCount === 0 && result.warningCount === 0) {
      step.success(`ESLint检查通过！检查了 ${result.checkedFiles.length} 个文件`);
    } else {
      // 只有警告，不卡点
      step.success(`ESLint检查通过！检查了 ${result.checkedFiles.length} 个文件`);
      step.warning(`发现 ${result.warningCount} 个警告，但不影响构建流程`);
      if (result.output && result.output !== 'ESLint检查通过') {
        step.warning(result.output);
      }
    }
  } else {
    // 有错误，进行卡点
    step.error(
      `ESLint检查失败！发现 ${result.errorCount} 个错误, ${result.warningCount} 个警告`
    );
    step.error(result.output);
  }

  return result;
}
