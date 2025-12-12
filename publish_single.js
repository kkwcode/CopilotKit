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

const packageName = process.argv[2];
if (!packageName) {
  console.log('用法: node publish_single.js <package-name>');
  console.log('可用包名:', Object.keys(packageMappings).map(name => name.replace('@copilotkit/', '')).join(', '));
  process.exit(1);
}

const fullPackageName = packageName.startsWith('@copilotkit/') ? packageName : `@copilotkit/${packageName}`;
const aliasName = packageMappings[fullPackageName];

if (!aliasName) {
  console.error('❌ 未找到包映射:', fullPackageName);
  process.exit(1);
}

const packagesDir = path.join(__dirname, 'CopilotKit/packages');
const packageDir = packageName.replace('@copilotkit/', '');
const packagePath = path.join(packagesDir, packageDir);

if (!fs.existsSync(packagePath)) {
  console.error('❌ 包目录不存在:', packagePath);
  process.exit(1);
}

const packageJsonPath = path.join(packagePath, 'package.json');
let originalPackageJson;

function updateWorkspaceDependencies(packageJson) {
  // 更新workspace依赖为npm alias形式
  if (packageJson.dependencies) {
    for (const [dep, version] of Object.entries(packageJson.dependencies)) {
      if (packageMappings[dep] && version === 'workspace:*') {
        packageJson.dependencies[dep] = `npm:${packageMappings[dep]}@1.9.1`;
        console.log(`  📦 依赖更新: ${dep} -> npm:${packageMappings[dep]}@1.9.1`);
      }
    }
  }
  
  if (packageJson.devDependencies) {
    for (const [dep, version] of Object.entries(packageJson.devDependencies)) {
      if (packageMappings[dep] && version === 'workspace:*') {
        packageJson.devDependencies[dep] = `npm:${packageMappings[dep]}@1.9.1`;
        console.log(`  🔧 开发依赖更新: ${dep} -> npm:${packageMappings[dep]}@1.9.1`);
      }
    }
  }
}

try {
  console.log(`\n🚀 发布 ${fullPackageName} -> ${aliasName}`);
  
  // 备份原始package.json
  originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(originalPackageJson);
  
  // 更新workspace依赖
  console.log('📋 更新workspace依赖...');
  updateWorkspaceDependencies(packageJson);
  
  // 修改包名
  packageJson.name = aliasName;
  
  // 写入临时package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  
  // 构建包
  console.log('🔨 构建包...');
  execSync('pnpm run build', { cwd: packagePath, stdio: 'inherit' });
  
  // 发布包
  console.log(`📡 发布到 ${aliasName}...`);
  execSync('npm publish --access public', {
    cwd: packagePath,
    stdio: 'inherit'
  });
  
  console.log(`✅ 成功发布 ${aliasName}`);
  
} catch (error) {
  console.error(`❌ 发布失败:`, error.message);
  process.exit(1);
} finally {
  // 恢复原始package.json
  if (originalPackageJson) {
    fs.writeFileSync(packageJsonPath, originalPackageJson);
    console.log('🔄 已恢复原始package.json');
  }
}