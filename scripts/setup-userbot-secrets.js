#!/usr/bin/env node

/**
 * Setup script for configuring Telegram Userbot secrets
 * This script helps users set up the required environment variables using Wrangler CLI
 * instead of storing sensitive data in wrangler.toml
 */

import readline from 'readline';
import { execSync } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    Telegram Userbot Secrets Setup                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

This script will help you configure Telegram Userbot secrets using Wrangler CLI.
Your sensitive data will be securely stored as Cloudflare Worker secrets and 
will NOT be committed to the codebase.

Before proceeding, make sure you have:
1. A Telegram API account (https://my.telegram.org/)
2. Wrangler CLI installed and authenticated (wrangler login)
3. Your Cloudflare Worker project set up

`);

const askQuestion = (prompt, required = true, defaultValue = null) => {
  return new Promise((resolve) => {
    const fullPrompt = prompt + (defaultValue !== null ? ` (${defaultValue})` : '') + ': ';
    
    rl.question(fullPrompt, (answer) => {
      if (!answer && required) {
        console.log('❌ This field is required. Please try again.');
        resolve(askQuestion(prompt, required, defaultValue));
      } else {
        resolve(answer || defaultValue);
      }
    });
  });
};

const setWranglerSecret = async (name, value) => {
  try {
    console.log(`🔐 Setting secret: ${name}`);
    
    // Try to set the secret directly first
    try {
      execSync(`echo "${value}" | wrangler secret put ${name}`, {
        stdio: 'pipe', // Use pipe to capture stderr
        shell: true
      });
      console.log(`✅ Secret ${name} set successfully`);
      return true;
    } catch (setError) {
      const errorMessage = setError.message || setError.stderr?.toString() || '';
      
      // Check if the error is because the secret already exists
      if (errorMessage.includes('already in use') || errorMessage.includes('already exists') || errorMessage.includes('Binding name') && errorMessage.includes('already in use')) {
        console.log(`⚠️  Secret ${name} already exists`);
        const overwrite = await askQuestion(`Overwrite existing secret ${name}? (yes/no)`, true, 'no');
        
        if (overwrite.toLowerCase() !== 'yes') {
          console.log(`⏭️  Skipping secret ${name}`);
          return 'skipped';
        }
        
        // Try to delete the existing secret first
        try {
          console.log(`🗑️  Deleting existing secret: ${name}`);
          execSync(`echo "y" | wrangler secret delete ${name}`, {
            stdio: 'pipe',
            shell: true
          });
          console.log(`✅ Secret ${name} deleted successfully`);
        } catch (deleteError) {
          console.error(`❌ Failed to delete existing secret ${name}:`, deleteError.message || deleteError.stderr?.toString());
          return false;
        }
        
        // Now try to set the secret again
        try {
          console.log(`🔐 Setting secret: ${name} (after deletion)`);
          execSync(`echo "${value}" | wrangler secret put ${name}`, {
            stdio: 'pipe',
            shell: true
          });
          console.log(`✅ Secret ${name} set successfully`);
          return true;
        } catch (retryError) {
          console.error(`❌ Failed to set secret ${name} after deletion:`, retryError.message || retryError.stderr?.toString());
          return false;
        }
      } else {
        // Some other error occurred
        console.error(`❌ Failed to set secret ${name}:`, errorMessage);
        return false;
      }
    }
  } catch (error) {
    console.error(`❌ Unexpected error setting secret ${name}:`, error.message);
    return false;
  }
};

const main = async () => {
  try {
    console.log('📋 Configuration Options:');
    console.log('1. Bot Mode - Use Bot Token (simpler, recommended for most use cases)');
    console.log('2. User Mode - Use Phone Number + Password (full user capabilities)');
    console.log('');
    
    const authMode = await askQuestion('Select authentication mode (1 or 2)', true, '1');
    
    const isBotMode = authMode === '1';
    const authModeValue = isBotMode ? 'bot' : 'user';
    
    console.log(`\n🔧 Selected mode: ${authModeValue.toUpperCase()}`);
    console.log('');
    
    // Common required secrets for both modes
    console.log('📝 Common Configuration (required for both modes):');
    const apiId = await askQuestion('Enter your Telegram API ID');
    const apiHash = await askQuestion('Enter your Telegram API Hash');
    const userbotEnabled = await askQuestion('Enable userbot? (true/false)', true, 'true');
    
    // Mode-specific secrets
    let botToken = '';
    let phoneNumber = '';
    let password = '';
    
    if (isBotMode) {
      console.log('\n📝 Bot Mode Configuration:');
      botToken = await askQuestion('Enter your Telegram Bot Token (from @BotFather)');
    } else {
      console.log('\n📝 User Mode Configuration:');
      phoneNumber = await askQuestion('Enter your phone number (with country code, e.g., +1234567890)');
      password = await askQuestion('Enter your 2FA password (if any, press Enter to skip)', false);
    }
    
    // Optional configuration
    console.log('\n📝 Optional Configuration:');
    const nodeEnv = await askQuestion('Node environment (development/production)', false, 'production');
    
    console.log('\n📋 Summary of your configuration:');
    console.log(`Authentication Mode: ${authModeValue.toUpperCase()}`);
    console.log(`API ID: ${apiId}`);
    console.log(`API Hash: ${apiHash.substring(0, 10)}...`);
    console.log(`Userbot Enabled: ${userbotEnabled}`);
    
    if (isBotMode) {
      console.log(`Bot Token: ${botToken.substring(0, 10)}...`);
    } else {
      console.log(`Phone Number: ${phoneNumber}`);
      if (password) {
        console.log(`Password: ${'*'.repeat(password.length)}`);
      }
    }
    console.log(`Node Environment: ${nodeEnv}`);
    
    console.log('\n⚠️  WARNING: This will set secrets for your Cloudflare Worker.');
    const confirm = await askQuestion('Continue? (yes/no)', true, 'yes');
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Setup cancelled by user.');
      rl.close();
      return;
    }
    
    console.log('\n🔧 Setting up secrets with Wrangler CLI...');
    console.log('');
    
    const secrets = [
      { name: 'TELEGRAM_API_ID', value: apiId },
      { name: 'TELEGRAM_API_HASH', value: apiHash },
      { name: 'USERBOT_ENABLED', value: userbotEnabled },
      { name: 'USERBOT_AUTH_MODE', value: authModeValue },
      { name: 'NODE_ENV', value: nodeEnv }
    ];
    
    if (isBotMode) {
      secrets.push({ name: 'TELEGRAM_BOT_TOKEN', value: botToken });
    } else {
      secrets.push({ name: 'TELEGRAM_PHONE_NUMBER', value: phoneNumber });
      if (password) {
        secrets.push({ name: 'TELEGRAM_PASSWORD', value: password });
      }
    }
    
    let successCount = 0;
    let skippedCount = 0;
    for (const secret of secrets) {
      const result = await setWranglerSecret(secret.name, secret.value);
      if (result === true) successCount++;
      if (result === 'skipped') skippedCount++;
    }
    
    console.log('');
    console.log(`📊 Setup Summary:`);
    console.log(`✅ Successfully set: ${successCount}/${secrets.length} secrets`);
    console.log(`⏭️  Skipped (already exist): ${skippedCount}/${secrets.length} secrets`);
    console.log(`❌ Failed: ${secrets.length - successCount - skippedCount}/${secrets.length} secrets`);
    
    if (successCount === secrets.length) {
      console.log('\n✅ All secrets configured successfully!');
      console.log('\n📖 Next steps:');
      console.log('1. Update your wrangler.toml to remove any sensitive data');
      console.log('2. Deploy your worker: wrangler deploy');
      console.log('3. Test the userbot functionality');
      console.log('\n💡 Tip: You can view your secrets with: wrangler secret list');
      console.log('💡 Tip: You can delete secrets with: wrangler secret delete <name>');
    } else if (successCount + skippedCount === secrets.length) {
      console.log('\n✅ Setup completed successfully!');
      console.log('Some secrets were skipped because they already exist.');
      console.log('\n📖 Next steps:');
      console.log('1. Deploy your worker: wrangler deploy');
      console.log('2. Test the userbot functionality');
      console.log('\n💡 Tip: You can view your secrets with: wrangler secret list');
    } else {
      console.log('\n⚠️  Some secrets failed to configure. Please check the errors above and try again.');
      console.log('💡 You can retry failed secrets manually using: wrangler secret put <name>');
      console.log('💡 Or run the script again to retry all secrets.');
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Make sure Wrangler CLI is installed: npm install -g wrangler');
    console.log('2. Make sure you\'re logged in: wrangler login');
    console.log('3. Make sure you\'re in the correct project directory');
    console.log('4. Check your internet connection');
  } finally {
    rl.close();
  }
};

main();