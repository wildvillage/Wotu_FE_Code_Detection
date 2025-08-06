import * as fs from 'fs';
import * as path from 'path';
import * as step from '@flow-step/step-toolkit';
import { execa } from 'execa';
import { detectPackageManager, getInstallCommand } from './util';

export interface TypeScriptCoverageConfig {
  enableCheck: boolean;
  threshold: number;
  projectDir: string;
  workSpace: string;
}

export interface TypeScriptCoverageResult {
  success: boolean;
  threshold: number;
  message: string;
}



/**
 * 安装TypeScript覆盖率相关依赖 | Install TypeScript coverage dependencies
 */
async function installCoverageDependencies(projectDir: string): Promise<void> {
  const packageManager = detectPackageManager(projectDir);
  
  step.info(`使用 ${packageManager} 安装 typescript-coverage-report 和 semantic-ui-react...`);
  
  const installCommand = getInstallCommand(packageManager, ['typescript-coverage-report', 'semantic-ui-react']);

  try {
    await execa(installCommand[0], installCommand.slice(1), {
      cwd: projectDir,
      encoding: 'utf8'
    });
    step.success('TypeScript覆盖率依赖安装成功');
  } catch (error: any) {
    throw new Error(`安装TypeScript覆盖率依赖失败: ${error.message}`);
  }
}

/**
 * 创建TypeScript覆盖率配置 | Create TypeScript coverage configuration in package.json
 */
function createCoverageConfig(projectDir: string, threshold: number): void {
  const packageJsonPath = path.join(projectDir, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('未找到 package.json 文件');
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // 添加scripts配置
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    packageJson.scripts['ts-coverage'] = 'typescript-coverage-report';
    
    // 添加typeCoverage配置到package.json
    packageJson.typeCoverage = {
      atLeast: threshold,
      detail: true,
      strict: true,
      cache: true,
      ignoreFiles: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        'test/**/*',
        'tests/**/*',
        '__tests__/**/*',
        '**/*.stories.ts',
        '**/*.stories.tsx',
        'scripts/**/*',
        'build/**/*',
        'dist/**/*',
        'node_modules/**/*'
      ]
    };

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    step.info(`已在 package.json 中添加 ts-coverage 脚本和 typeCoverage 配置`);
  } catch (error: any) {
    throw new Error(`配置 typeCoverage 失败: ${error.message}`);
  }
}

/**
 * 执行TypeScript覆盖率检查 | Perform TypeScript coverage check
 */
export async function performTypeScriptCoverageCheck(
  config: TypeScriptCoverageConfig
): Promise<TypeScriptCoverageResult> {
  const { enableCheck, threshold, projectDir } = config;

  if (!enableCheck) {
    return {
      success: true,
      threshold: threshold,
      message: 'TypeScript覆盖率检查已禁用'
    };
  }

  step.info('开始执行 TypeScript 覆盖率检查...');
  step.info(`项目目录: ${projectDir}`);
  step.info(`覆盖率阈值: ${threshold}%`);

  // 检查是否存在tsconfig.json
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error('未找到 tsconfig.json 文件，无法进行TypeScript覆盖率检查');
  }

  try {
    // 检查是否已安装typescript-coverage-report
    const packageJsonPath = path.join(projectDir, 'package.json');
    let needInstall = true;
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const devDependencies = packageJson.devDependencies || {};
      needInstall = !devDependencies['typescript-coverage-report'];
    }

    // 如果需要安装依赖
    if (needInstall) {
      step.info('检测到项目中未安装 typescript-coverage-report，正在安装...');
      await installCoverageDependencies(projectDir);
    } else {
      step.info('检测到项目中已安装 typescript-coverage-report');
    }

    // 创建配置文件
    createCoverageConfig(projectDir, threshold);

    // 使用项目的包管理器执行覆盖率检查
    const packageManager = detectPackageManager(projectDir);
    step.info('执行 TypeScript 覆盖率检查...');
    
    let command: string[];
    switch (packageManager) {
      case 'pnpm':
        command = ['pnpm', 'ts-coverage'];
        break;
      case 'yarn':
        command = ['yarn', 'ts-coverage'];
        break;
      default:
        command = ['npm', 'run', 'ts-coverage'];
        break;
    }

    const result = await execa(command[0], command.slice(1), {
      cwd: projectDir,
      encoding: 'utf8',
      all: true  // 合并 stdout 和 stderr
    });

    // 解析输出结果 - 使用合并的输出
    const output = result.all || result.stdout;
    step.info('TypeScript覆盖率检查输出:');
    step.info(output);
    
    return {
      success: true,
      threshold,
      message: `TypeScript覆盖率检查通过，检测结果大于${threshold}%。详情请查看输出日志`
    };

  } catch (error: any) {
    // 如果是因为覆盖率不达标导致的错误
    if (error.exitCode === 1 && (error.all || error.stdout)) {
      const output = error.all || error.stdout;
      
      step.error('TypeScript覆盖率检查输出:');
      step.info(output);
      
      return {
        success: false,
        threshold,
        message: `TypeScript覆盖率检查失败，检测结果小于${threshold}%。详情请查看输出日志`,
      };
    }
    
    throw new Error(`TypeScript覆盖率检查执行失败: ${error.message}`);
  }
}