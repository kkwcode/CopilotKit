#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 包映射关系
const packageMappings = {
  '@copilotkit/shared': '@tencent/copilotkit-shared',
  '@copilotkit/react-core': '@tencent/copilotkit-react-core',
  '@copilotkit/react-textarea': '@tencent/copilotkit-react-textarea',
  '@copilotkit/react-ui': '@tencent/copilotkit-react-ui',
  '@copilotkit/runtime-client-gql': '@tencent/copilotkit-runtime-client-gql',
  '@copilotkit/runtime': '@tencent/copilotkit-runtime',
  '@copilotkit/sdk-js': '@tencent/copilotkit-sdk-js'
};

const packagesDir = path.join(__dirname, 'CopilotKit/packages');
const targetVersion = '1.9.1';

console.log('🚀 开始发布 CopilotKit 包到 @tencent 命名空间...');

// 获取所有包目录
const packages = fs.readdirSync(packagesDir).filter(dir => {
  const packagePath = path.join(packagesDir, dir);
  return fs.statSync(packagePath).isDirectory() && fs.existsSync(path.join(packagePath, 'package.json'));
});

console.log(`📦 发现 ${packages.length} 个包:`, packages);

// 发布顺序：先发布基础包，再发布依赖包
const publishOrder = [
  'shared',
  'runtime-client-gql', 
  'react-core',
  'react-textarea',
  'react-ui',
  'runtime',
  'sdk-js'
];

function updatePackageVersion(packagePath, version) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // 更新版本
  packageJson.version = version;
  
  // 更新workspace依赖为npm alias形式
  if (packageJson.dependencies) {
    for (const [dep, version] of Object.entries(packageJson.dependencies)) {
      if (packageMappings[dep] && version === 'workspace:*') {
        packageJson.dependencies[dep] = `npm:${packageMappings[dep]}@${targetVersion}`;
      }
    }
  }
  
  if (packageJson.devDependencies) {
    for (const [dep, version] of Object.entries(packageJson.devDependencies)) {
      if (packageMappings[dep] && version === 'workspace:*') {
        packageJson.devDependencies[dep] = `npm:${packageMappings[dep]}@${targetVersion}`;
      }
    }
  }
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✅ 更新 ${packageJson.name} 版本到 ${version}`);
  
  return packageJson;
}

function publishPackage(packagePath, originalName, aliasName) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  let originalPackageJson;
  
  try {
    console.log(`\n📤 发布 ${originalName} -> ${aliasName}...`);
    
    // 构建包
    console.log('🔨 构建包...');
    execSync('pnpm run build', { cwd: packagePath, stdio: 'inherit' });
    
    // 备份并修改package.json的name字段
    originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(originalPackageJson);
    packageJson.name = aliasName;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    
    // 发布包
    console.log(`📡 发布到 ${aliasName}...`);
    execSync('npm publish --access public --registry https://registry.npmjs.org/', {
      cwd: packagePath,
      stdio: 'inherit'
    });
    
    console.log(`✅ 成功发布 ${aliasName}`);
    
  } catch (error) {
    console.error(`❌ 发布 ${originalName} 失败:`, error.message);
    throw error;
  } finally {
    // 恢复原始package.json
    if (originalPackageJson) {
      fs.writeFileSync(packageJsonPath, originalPackageJson);
    }
  }
}

function restorePackageJson(packagePath, originalContent) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  fs.writeFileSync(packageJsonPath, originalContent);
}

async function main() {
  const backups = new Map();
  
  try {
    // 1. 备份并更新所有package.json
    console.log('\n📋 备份并更新 package.json 文件...');
    for (const pkg of publishOrder) {
      if (packages.includes(pkg)) {
        const packagePath = path.join(packagesDir, pkg);
        const packageJsonPath = path.join(packagePath, 'package.json');
        
        // 备份原始内容
        const originalContent = fs.readFileSync(packageJsonPath, 'utf8');
        backups.set(packagePath, originalContent);
        
        // 更新版本和依赖
        const packageJson = updatePackageVersion(packagePath, targetVersion);
      }
    }
    
    // 2. 按顺序发布包
    console.log('\n🚀 开始按顺序发布包...');
    for (const pkg of publishOrder) {
      if (packages.includes(pkg)) {
        const packagePath = path.join(packagesDir, pkg);
        const packageJson = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'));
        const originalName = packageJson.name;
        const aliasName = packageMappings[originalName];
        
        if (aliasName) {
          await publishPackage(packagePath, originalName, aliasName);
        }
      }
    }
    
    console.log('\n🎉 所有包发布完成！');
    
  } catch (error) {
    console.error('\n❌ 发布过程中出现错误:', error.message);
  } finally {
    // 3. 恢复所有package.json文件
    console.log('\n🔄 恢复 package.json 文件...');
    for (const [packagePath, originalContent] of backups) {
      restorePackageJson(packagePath, originalContent);
      console.log(`✅ 恢复 ${path.basename(packagePath)}/package.json`);
    }
  }
}

main().catch(console.error);