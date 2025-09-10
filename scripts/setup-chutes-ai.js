#!/usr/bin/env node

/**
 * Setup script for configuring PR-Agent with Chutes AI
 * This script helps users set up the required environment variables and GitHub secrets
 */

import readline from 'readline';
import { execSync } from 'child_process';
import fs from 'fs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                       PR-Agent + Chutes AI Setup                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

This script will help you configure PR-Agent to use Chutes AI as the OpenAI-compatible
endpoint for automated code reviews and PR descriptions.

Before proceeding, make sure you have:
1. A Chutes AI account (https://chutes.ai/)
2. A deployed model on Chutes AI (VLLM template recommended)
3. GitHub CLI installed and authenticated (gh auth login)

`);

const questions = [
  {
    name: 'chutesApiKey',
    message: 'Enter your Chutes AI API Key:',
    required: true
  },
  {
    name: 'chutesBaseUrl',
    message: 'Enter your Chutes AI Base URL (e.g., https://yourusername-chutename.chutes.ai/v1):',
    required: true
  },
  {
    name: 'chutesModel',
    message: 'Enter your Chutes AI Model (e.g., deepseek-ai/DeepSeek-V3-0324):',
    required: true,
    default: 'deepseek-ai/DeepSeek-V3-0324'
  },
  {
    name: 'githubRepo',
    message: 'Enter your GitHub repository (e.g., owner/repo):',
    required: true
  }
];

const answers = {};

const askQuestion = (index) => {
  if (index >= questions.length) {
    setupComplete();
    return;
  }

  const question = questions[index];
  const prompt = question.message + (question.default ? ` (${question.default})` : '') + ': ';
  
  rl.question(prompt, (answer) => {
    if (!answer && question.required) {
      console.log('❌ This field is required. Please try again.');
      askQuestion(index);
      return;
    }
    
    answers[question.name] = answer || question.default;
    askQuestion(index + 1);
  });
};

const setupComplete = () => {
  console.log('\n✅ Configuration collected successfully!');
  console.log('\n📋 Summary of your configuration:');
  console.log(`Chutes AI API Key: ${answers.chutesApiKey.substring(0, 20)}...`);
  console.log(`Chutes AI Base URL: ${answers.chutesBaseUrl}`);
  console.log(`Chutes AI Model: ${answers.chutesModel}`);
  console.log(`GitHub Repository: ${answers.githubRepo}`);
  
  console.log('\n🔧 Setting up environment variables...');
  
  // Create or update .env file
  const envContent = `# Chutes AI Configuration for PR-Agent
CHUTES_AI_API_KEY=${answers.chutesApiKey}
CHUTES_AI_BASE_URL=${answers.chutesBaseUrl}
CHUTES_AI_MODEL=${answers.chutesModel}
`;
  
  try {
    fs.writeFileSync('.env', envContent);
    console.log('✅ Environment variables saved to .env file');
  } catch (error) {
    console.error('❌ Failed to save .env file:', error.message);
  }
  
  console.log('\n🔐 Setting up GitHub secrets...');
  
  // Set GitHub secrets
  try {
    execSync(`gh secret set CHUTES_AI_API_KEY --body="${answers.chutesApiKey}" --repo=${answers.githubRepo}`, { stdio: 'inherit' });
    execSync(`gh secret set CHUTES_AI_BASE_URL --body="${answers.chutesBaseUrl}" --repo=${answers.githubRepo}`, { stdio: 'inherit' });
    execSync(`gh secret set CHUTES_AI_MODEL --body="${answers.chutesModel}" --repo=${answers.githubRepo}`, { stdio: 'inherit' });
    console.log('✅ GitHub secrets configured successfully');
  } catch (error) {
    console.error('❌ Failed to set GitHub secrets:', error.message);
    console.log('Please set the secrets manually in your GitHub repository settings');
  }
  
  console.log('\n📖 Next steps:');
  console.log('1. Commit and push the workflow and configuration files:');
  console.log('   git add .github/workflows/pr-agent.yml .pr_agent.toml .env');
  console.log('   git commit -m "Add PR-Agent with Chutes AI integration"');
  console.log('   git push origin main');
  console.log('2. Create a test pull request to verify the integration works');
  console.log('3. Check the Actions tab in your GitHub repository for workflow execution');
  
  console.log('\n🚀 Setup complete! PR-Agent will now use Chutes AI for code reviews.');
  
  rl.close();
};

askQuestion(0);