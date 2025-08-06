import process from 'process';

export class IParams {
  pipelineID!: number;
  pipelineName!: string;
  buildNumber?: number;
  workSpace!: string;
  projectDir!: string;
  buildJobID!: number;
  // 构建相关环境变量
  userScript?: string;
  // ESLint 相关环境变量
  enableESLintCheck?: string;
  sourceBranch?: string;
  targetBranch?: string;
  fullCheckMode?: string;
  checkDirectories?: string;
  // TypeScript 相关环境变量
  enableTypeScriptCheck?: string;
  fullTypeScriptCheckMode?: string;
  // 环境分支部署模式相关环境变量
  envBranchDeployMode?: string;
  // CI 相关环境变量
  ciCommitRefName?: string;
  gitBranch?: string;
  // TypeScript 覆盖率相关环境变量
  enableTypeScriptCoverageReport?: string;
  typeScriptCoverageThreshold?: string;
}

export function getParams(): IParams {
  let params = new IParams();
  
  // 基础流水线参数
  params.pipelineID = Number(process.env.PIPELINE_ID);
  params.pipelineName = process.env.PIPELINE_NAME as string;
  params.buildNumber = Number(process.env.BUILD_NUMBER);
  params.workSpace = process.env.WORK_SPACE as string;
  params.projectDir = process.env.PROJECT_DIR as string;
  params.buildJobID = Number(process.env.BUILD_JOB_ID);
  
  // 构建相关环境变量
  params.userScript = process.env.user_script;
  
  // ESLint 相关环境变量
  params.enableESLintCheck = process.env.enable_eslint_check;
  params.sourceBranch = process.env.source_branch;
  params.targetBranch = process.env.target_branch;
  params.fullCheckMode = process.env.full_check_mode;
  params.checkDirectories = process.env.check_directories;
  
  // TypeScript 相关环境变量
  params.enableTypeScriptCheck = process.env.enable_typescript_check;
  params.fullTypeScriptCheckMode = process.env.full_typescript_check_mode;
  
  // 环境分支部署模式相关环境变量
  params.envBranchDeployMode = process.env.env_branch_deploy_mode;
  
  // CI 相关环境变量
  params.ciCommitRefName = process.env.CI_COMMIT_REF_NAME;
  params.gitBranch = process.env.GIT_BRANCH;
  
  // TypeScript 覆盖率相关环境变量
  params.enableTypeScriptCoverageReport = process.env.enable_typescript_coverage_report;
  params.typeScriptCoverageThreshold = process.env.typescript_coverage_threshold;
  
  return params;
}
