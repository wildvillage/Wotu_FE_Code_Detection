import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';
import * as step from '@flow-step/step-toolkit';
import { simpleGit } from 'simple-git';

export interface TypeScriptConfig {
  projectDir: string;
  files: string[];
  fullCheck: boolean;
  checkDirectories: string[];
  sourceBranch: string;
  targetBranch: string;
}

export interface TypeScriptResult {
  success: boolean;
  errorCount: number;
  warningCount: number;
  output: string;
  checkedFiles: number;
}

/**
 * 获取变更文件列表（复用ESLint的逻辑）
 */
async function getChangedFiles(config: TypeScriptConfig): Promise<string[]> {
  try {
    const { projectDir, sourceBranch, targetBranch } = config;
    
    step.info(`获取变更文件: ${sourceBranch} -> ${targetBranch}`);
    
    const git = simpleGit(projectDir);
    
    // 获取远程分支最新状态
    await git.fetch();
    
    // 获取两个分支之间的差异文件
    let diff: string;
    if (sourceBranch) {
      // 指定了源分支，比较两个分支的差异
      diff = await git.diff(['--name-only', `origin/${targetBranch}`, `origin/${sourceBranch}`]);
    } else {
      // 使用当前分支与目标分支比较
      diff = await git.diff(['--name-only', `origin/${targetBranch}`, 'HEAD']);
    }
    
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
 * 过滤TypeScript文件并验证存在性
 */
function filterTypeScriptFiles(
  files: string[],
  projectDir: string,
  checkDirectories: string[]
): string[] {
  const typeScriptExtensions = ['.ts', '.tsx', '.vue'];
  
  // 需要排除的目录和文件模式
  const excludePatterns = [
    'node_modules/',
    'lib/',
    'dist/',
    '.test.ts',
    '.spec.ts',
    'test/'
  ];

  return files
    .filter(file => {
      // 只处理TypeScript文件
      return typeScriptExtensions.some(ext => file.endsWith(ext));
    })
    .filter(file => {
      // 排除不需要检查的文件和目录
      const shouldExclude = excludePatterns.some(pattern => {
        if (pattern.endsWith('/')) {
          // 目录模式
          return file.startsWith(pattern) || file.includes('/' + pattern);
        } else {
          // 文件模式
          return file.includes(pattern);
        }
      });
      
      if (shouldExclude) {
        step.info(`跳过排除的文件: ${file}`);
        return false;
      }
      
      return true;
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
 * 运行 TypeScript 类型检查
 * @param config TypeScript 检查配置
 * @returns TypeScript 检查结果
 */
export async function runTypeScriptCheck(config: TypeScriptConfig): Promise<TypeScriptResult> {
  const { projectDir, files, fullCheck, checkDirectories } = config;
  
  try {
    // 检查是否存在 tsconfig.json
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      step.info('未找到 tsconfig.json 文件，跳过 TypeScript 检查');
      return {
        success: true,
        errorCount: 0,
        warningCount: 0,
        output: '未找到 tsconfig.json 文件，跳过 TypeScript 检查',
        checkedFiles: 0
      };
    }

    let command: string;
    let filesToCheck: string[];
    
    if (fullCheck) {
      // 全量检查：使用 tsc --noEmit 检查整个项目
      // 添加 --skipLibCheck 参数避免检查 node_modules 中的类型定义文件
      // 使用项目的 tsconfig.json 来解析路径别名
      command = 'npx tsc --noEmit --skipLibCheck --project tsconfig.json';
      filesToCheck = [];
      step.info('开始全量TypeScript检查...');
    } else {
      // 增量检查：只检查指定文件
      let actualFiles: string[];
      
      if (files.length === 0) {
        // 如果没有传入文件列表，获取变更文件
        const changedFiles = await getChangedFiles(config);
        actualFiles = filterTypeScriptFiles(changedFiles, projectDir, checkDirectories);
      } else {
        // 使用传入的文件列表，但仍需过滤TypeScript文件
        actualFiles = filterTypeScriptFiles(files, projectDir, checkDirectories);
      }
      
      if (actualFiles.length === 0) {
        return {
          success: true,
          errorCount: 0,
          warningCount: 0,
          output: '没有需要检查的 TypeScript 文件',
          checkedFiles: 0
        };
      }
      
      filesToCheck = actualFiles;
      
      // 使用 tsc --noEmit 检查指定文件
      // 添加 --skipLibCheck 参数避免检查 node_modules 中的类型定义文件
      const fileList = actualFiles.map(file => `"${file}"`).join(' ');
      command = `npx tsc --noEmit --skipLibCheck ${fileList}`;
      step.info(`开始对 ${actualFiles.length} 个变更文件进行TypeScript检查`);
      
      // 显示检查的文件
      actualFiles.forEach(file => step.info(`  - ${file}`));
    }

    step.info(`执行 TypeScript 检查命令: ${command}`);
    
    // 执行 TypeScript 检查
    const result = await execa(command, {
      cwd: projectDir,
      encoding: 'utf8',
      shell: true
    });

    // 如果没有输出，说明检查通过
    return {
      success: true,
      errorCount: 0,
      warningCount: 0,
      output: 'TypeScript 检查通过',
      checkedFiles: fullCheck ? -1 : filesToCheck.length // -1 表示全量检查
    };

  } catch (error: any) {
    // TypeScript 编译器在发现错误时会抛出异常
    const output = error.stdout || error.message || '';

    // 清理路径前缀
    const cleanedOutput = output.replace(new RegExp(projectDir, 'g'), '.');

    // 解析 TypeScript 错误输出
    const { errorCount, warningCount } = parseTypeScriptOutput(cleanedOutput);

    // 计算实际检查的文件数量
    let actualCheckedFiles = 0;
    if (fullCheck) {
      actualCheckedFiles = -1; // -1 表示全量检查
    } else {
      // 从错误输出中统计实际涉及的文件数量
      const fileSet = new Set<string>();
      const lines = cleanedOutput.split('\n');
      for (const line of lines) {
        // 匹配文件路径格式：src/path/file.tsx(line,col): error
        const match = line.match(/^([^(]+)\(\d+,\d+\):\s*(error|warning)/);
        if (match) {
          fileSet.add(match[1]);
        }
      }
      actualCheckedFiles = fileSet.size;
    }

    return {
      success: errorCount === 0,
      errorCount,
      warningCount,
      output: cleanedOutput,
      checkedFiles: actualCheckedFiles
    };
  }
}

/**
 * 解析 TypeScript 编译器输出，统计错误和警告数量
 * @param output TypeScript 编译器输出
 * @returns 错误和警告统计
 */
function parseTypeScriptOutput(output: string): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;
  
  // TypeScript 编译器输出格式通常是：
  // src/file.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
  // 或者在最后有总结：Found 5 errors.
  
  const lines = output.split('\n');
  
  for (const line of lines) {
    // 匹配错误行
    if (line.includes(': error TS')) {
      errorCount++;
    }
    // 匹配警告行（虽然 tsc 通常不输出警告，但为了完整性）
    else if (line.includes(': warning TS')) {
      warningCount++;
    }
    // 匹配总结行：Found X errors.
    else if (line.match(/Found (\d+) error/)) {
      const match = line.match(/Found (\d+) error/);
      if (match) {
        errorCount = Math.max(errorCount, parseInt(match[1], 10));
      }
    }
  }
  
  return { errorCount, warningCount };
}

/**
 * 执行 TypeScript 检查的主函数
 * @param projectDir 项目目录
 * @param files 要检查的文件列表
 * @param fullCheck 是否全量检查
 * @param checkDirectories 检查目录列表
 * @param sourceBranch 源分支
 * @param targetBranch 目标分支
 * @returns TypeScript 检查结果
 */
export async function performTypeScriptCheck(
  projectDir: string,
  files: string[],
  fullCheck: boolean,
  checkDirectories: string[] = ['src'],
  sourceBranch: string = '',
  targetBranch: string = 'master'
): Promise<TypeScriptResult> {
  const config: TypeScriptConfig = {
    projectDir,
    files,
    fullCheck,
    checkDirectories,
    sourceBranch,
    targetBranch
  };

  step.info(`开始 TypeScript 检查...`);
  step.info(`检查模式: ${fullCheck ? '全量检查' : '增量检查'}`);
  
  if (!fullCheck && files.length > 0) {
    step.info(`待检查文件数量: ${files.length}`);
    files.forEach(file => {
      step.info(`  - ${file}`);
    });
  }

  const result = await runTypeScriptCheck(config);

  // 输出检查结果
  if (result.success) {
    if (result.checkedFiles === 0) {
      step.info('TypeScript 检查完成：没有需要检查的文件');
    } else {
      step.success('TypeScript 检查通过');
      if (result.checkedFiles > 0) {
        step.success(`检查文件数量: ${result.checkedFiles}`);
      }
    }
  } else {
    step.error('TypeScript 检查失败');
    step.error(`错误数量: ${result.errorCount}`);
    if (result.warningCount > 0) {
      step.warning(`警告数量: ${result.warningCount}`);
    }
    if (result.checkedFiles > 0) {
      step.info(`检查文件数量: ${result.checkedFiles}`);
    }
    
    if (result.output) {
      step.info('\n详细信息:');
      step.error(result.output);
    }
  }

  return result;
}