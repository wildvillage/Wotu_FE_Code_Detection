#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 递增版本号
 * @param {string} version - 当前版本号，如 "1.0.10"
 * @returns {string} 新版本号，如 "1.0.11"
 */
function incrementVersion(version) {
  const parts = version.split('.');
  const patch = parseInt(parts[2]) + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

/**
 * 更新package.json中的版本号
 * @param {string} newVersion - 新版本号
 */
function updatePackageVersion(newVersion) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✅ 已更新 package.json 版本号为: ${newVersion}`);
}

/**
 * 主函数：执行自动发布流程
 */
async function autoPublish() {
  try {
    // 1. 读取当前版本
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const currentVersion = packageJson.version;
    
    // 2. 计算新版本号
    const newVersion = incrementVersion(currentVersion);
    const newVersionTag = `v${newVersion}`;
    
    console.log(`📦 当前版本: ${currentVersion}`);
    console.log(`🚀 准备发布版本: ${newVersionTag}`);
    console.log('');
    
    // 3. 启动 flow-cli step publish 进程
    console.log('🔄 开始执行 flow-cli step publish...');
    const child = spawn('flow-cli', ['step', 'publish'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..')
    });
    
    let publishSuccess = false;
    let outputBuffer = '';
    
    // 监听标准输出
    child.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      
      // 实时显示输出（除了版本输入提示）
      if (!output.includes('Please input step version to publish like vx.y.z:')) {
        process.stdout.write(output);
      }
      
      // 检测到版本输入提示时，自动输入版本号
      if (output.includes('Please input step version to publish like vx.y.z:')) {
        console.log(`Please input step version to publish like vx.y.z: ${newVersionTag}`);
        child.stdin.write(`${newVersionTag}\n`);
      }
      
      // 检测发布成功 - 匹配实际的成功消息格式
      if (output.includes('publish success with stepID') || 
          output.includes('publish success') ||
          output.includes('Step Wotu_FE_Code_Detection publish success')) {
        publishSuccess = true;
        console.log('🎉 检测到发布成功信号');
      }
    });
    
    // 监听标准错误
    child.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      outputBuffer += errorOutput;
      process.stderr.write(errorOutput);
    });
    
    // 等待进程结束
    child.on('close', (code) => {
      console.log('');
      console.log(`🔍 调试信息: 退出代码=${code}, 发布成功标志=${publishSuccess}`);
      
      if (code === 0 && publishSuccess) {
        console.log('✅ 发布成功！');
        
        // 4. 更新package.json版本号
        updatePackageVersion(newVersion);
        
        console.log('');
        console.log('📋 发布摘要:');
        console.log(`   旧版本: ${currentVersion}`);
        console.log(`   新版本: ${newVersion}`);
        console.log(`   发布标签: ${newVersionTag}`);
        
      } else if (code === 0 && !publishSuccess) {
        console.log('⚠️  进程正常退出但未检测到发布成功信号');
        console.log('🔍 检查输出日志中是否包含发布成功信息...');
        
        // 检查完整输出中是否包含成功信息
        if (outputBuffer.includes('Step Wotu_FE_Code_Detection publish success') ||
            outputBuffer.includes('publish success with stepID') ||
            outputBuffer.includes('publish failed')) {
          
          if (outputBuffer.includes('publish failed')) {
            console.log('❌ 在完整日志中发现发布失败信息');
            console.log('   失败原因可能包含在上述日志中');
            process.exit(1);
          } else {
            console.log('✅ 在完整日志中发现发布成功信息，判定为发布成功！');
            updatePackageVersion(newVersion);
            
            console.log('');
            console.log('📋 发布摘要:');
            console.log(`   旧版本: ${currentVersion}`);
            console.log(`   新版本: ${newVersion}`);
            console.log(`   发布标签: ${newVersionTag}`);
          }
        } else {
          console.log('❌ 发布失败，未更新版本号');
          console.log(`   退出代码: ${code}`);
          process.exit(1);
        }
      } else {
        console.log('❌ 发布失败，未更新版本号');
        console.log(`   退出代码: ${code}`);
        process.exit(1);
      }
    });
    
    // 处理进程错误
    child.on('error', (error) => {
      console.error('❌ 执行 flow-cli 时发生错误:', error.message);
      console.error('请确保已安装 flow-cli 并且在 PATH 中可用');
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ 自动发布脚本执行失败:', error.message);
    process.exit(1);
  }
}

// 执行自动发布
autoPublish();