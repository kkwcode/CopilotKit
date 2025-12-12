#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packagesDir = path.join(__dirname, 'CopilotKit/packages');
const targetVersion = '1.9.1';

console.log('📦 更新所有包版本到', targetVersion);

// 获取所有包目录
const packages = fs.readdirSync(packagesDir).filter(dir => {
  const packagePath = path.join(packagesDir, dir);
  return fs.statSync(packagePath).isDirectory() && fs.existsSync(path.join(packagePath, 'package.json'));
});

packages.forEach(pkg => {
  const packagePath = path.join(packagesDir, pkg);
  const packageJsonPath = path.join(packagePath, 'package.json');
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const oldVersion = packageJson.version;
  packageJson.version = targetVersion;
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✅ ${packageJson.name}: ${oldVersion} -> ${targetVersion}`);
});

console.log('🎉 版本更新完成！');