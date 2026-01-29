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
const targetVersion = '1.9.1-patch.26';

console.log(`🚀 开始使用 npm alias 发布 CopilotKit 包到 @tencent 命名空间 (版本: ${targetVersion})...`);

// 获取所有包目录
const packages = fs.readdirSync(packagesDir).filter(dir => {
  const packagePath = path.join(packagesDir, dir);
  return fs.statSync(packagePath).isDirectory() && fs.existsSync(path.join(packagePath, 'package.json'));
});

console.log(`📦 发现 ${packages.length} 个包:`, packages);

// 分阶段发布：先发布基础包，再发布依赖包
const publishPhases = [
  {
    name: '基础包（无内部依赖）',
    packages: ['shared']
  },
  {
    name: '客户端包',
    packages: ['runtime-client-gql']
  },
  {
    name: '核心包',
    packages: ['react-core']
  },
  {
    name: 'UI组件包',
    packages: ['react-textarea', 'react-ui']
  },
  {
    name: '运行时包',
    packages: ['runtime']
  },
  {
    name: 'SDK包',
    packages: ['sdk-js']
  }
];

function updatePackageVersion(packagePath, version) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // 更新版本
  packageJson.version = version;
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✅ 更新 ${packageJson.name} 版本到 ${version}`);
  
  return packageJson;
}

function publishPackageWithAlias(packagePath, originalName, aliasName, isFirstPackage = false) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  let originalPackageJson;
  
  try {
    console.log(`\n📤 发布 ${originalName} -> ${aliasName} (使用 npm alias)...`);
    
    // 构建包
    console.log('🔨 构建包...');
    execSync('pnpm run build', { cwd: packagePath, stdio: 'inherit' });
    
    // 备份并修改package.json
    originalPackageJson = fs.readFileSync(packageJsonPath, 'utf8');
    let packageJson = JSON.parse(originalPackageJson);
    
    // 更新包名和版本
    packageJson.name = aliasName;
    packageJson.version = targetVersion;
    
    // 如果不是第一个包，更新workspace依赖为npm alias形式
    if (!isFirstPackage) {
      if (packageJson.dependencies) {
        for (const [dep, depVersion] of Object.entries(packageJson.dependencies)) {
          if (packageMappings[dep] && depVersion.startsWith('workspace:')) {
            packageJson.dependencies[dep] = `npm:${packageMappings[dep]}@${targetVersion}`;
          }
        }
      }
      
      if (packageJson.devDependencies) {
        for (const [dep, depVersion] of Object.entries(packageJson.devDependencies)) {
          if (packageMappings[dep] && depVersion.startsWith('workspace:')) {
            packageJson.devDependencies[dep] = `npm:${packageMappings[dep]}@${targetVersion}`;
          }
        }
      }
    }
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    
    // 发布包 - 使用 --tag patch 标记为补丁版本
    console.log(`📡 发布到 ${aliasName}@${targetVersion} (tag: patch)...`);
    execSync('npm publish --access public --tag patch --registry https://mirrors.tencent.com/npm/', {
      cwd: packagePath,
      stdio: 'inherit'
    });
    
    console.log(`✅ 成功发布 ${aliasName}@${targetVersion} (tag: patch)`);
    
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
    // 1. 备份并更新所有package.json版本
    console.log('\n📋 备份并更新 package.json 文件...');
    const allPackagesToPublish = publishPhases.flatMap(phase => phase.packages);
    
    for (const pkg of allPackagesToPublish) {
      if (packages.includes(pkg)) {
        const packagePath = path.join(packagesDir, pkg);
        const packageJsonPath = path.join(packagePath, 'package.json');
        
        // 备份原始内容
        const originalContent = fs.readFileSync(packageJsonPath, 'utf8');
        backups.set(packagePath, originalContent);
        
        // 更新版本
        updatePackageVersion(packagePath, targetVersion);
      }
    }
    
    // 2. 分阶段发布包
    console.log('\n🚀 开始分阶段发布包...');
    
    for (const phase of publishPhases) {
      console.log(`\n📋 发布阶段: ${phase.name}`);
      
      for (const pkg of phase.packages) {
        if (packages.includes(pkg)) {
          const packagePath = path.join(packagesDir, pkg);
          const packageJson = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'));
          const originalName = packageJson.name;
          const aliasName = packageMappings[originalName];
          
          if (aliasName) {
            const isFirstPackage = phase.name.includes('基础包');
            await publishPackageWithAlias(packagePath, originalName, aliasName, isFirstPackage);
          }
        }
      }
      
      // 每个阶段之间稍作等待，确保包已经可用
      if (phase !== publishPhases[publishPhases.length - 1]) {
        console.log('⏳ 等待包在 npm registry 中生效...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log(`\n🎉 所有包发布完成！版本: ${targetVersion} (tag: patch)`);
    console.log('\n📝 安装命令:');
    Object.values(packageMappings).forEach(aliasName => {
      console.log(`  npm install ${aliasName}@patch`);
    });
    
    console.log('\n📝 或者安装特定版本:');
    Object.values(packageMappings).forEach(aliasName => {
      console.log(`  npm install ${aliasName}@${targetVersion}`);
    });
    
  } catch (error) {
    console.error('\n❌ 发布过程中出现错误:', error.message);
    process.exit(1);
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