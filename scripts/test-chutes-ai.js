#!/usr/bin/env node

/**
 * Test script for verifying Chutes AI integration with PR-Agent
 * This script tests the API connection and model availability
 */

import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config();

const {
  CHUTES_AI_API_KEY,
  CHUTES_AI_BASE_URL,
  CHUTES_AI_MODEL
} = process.env;

if (!CHUTES_AI_API_KEY || !CHUTES_AI_BASE_URL || !CHUTES_AI_MODEL) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure the following are set in your .env file:');
  console.error('- CHUTES_AI_API_KEY');
  console.error('- CHUTES_AI_BASE_URL');
  console.error('- CHUTES_AI_MODEL');
  process.exit(1);
}

console.log('🧪 Testing Chutes AI Integration');
console.log('================================\n');

// Test 1: Check API connectivity
async function testApiConnectivity() {
  console.log('Test 1: Checking API connectivity...');
  
  try {
    const response = await fetch(`${CHUTES_AI_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CHUTES_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API connection successful');
      console.log(`   Available models: ${data.data?.length || 'unknown'}`);
      return true;
    } else {
      console.error('❌ API connection failed');
      console.error(`   Status: ${response.status}`);
      console.error(`   Status text: ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error('❌ API connection error');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Test 2: Test chat completion
async function testChatCompletion() {
  console.log('\nTest 2: Testing chat completion...');
  
  const testPayload = {
    model: CHUTES_AI_MODEL,
    messages: [
      {
        role: 'user',
        content: 'Hello! Please respond with "Chutes AI test successful"'
      }
    ],
    max_tokens: 20,
    temperature: 0.1,
  };

  try {
    const response = await fetch(`${CHUTES_AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHUTES_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      console.log('✅ Chat completion successful');
      console.log(`   Model: ${data.model}`);
      console.log(`   Response: ${content}`);
      return true;
    } else {
      console.error('❌ Chat completion failed');
      console.error(`   Status: ${response.status}`);
      console.error(`   Status text: ${response.statusText}`);
      
      // Try to get error details
      try {
        const errorData = await response.json();
        console.error(`   Error details: ${JSON.stringify(errorData)}`);
      } catch (e) {
        // Ignore if error response is not JSON
      }
      return false;
    }
  } catch (error) {
    console.error('❌ Chat completion error');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Test 3: Test streaming chat completion
async function testStreamingCompletion() {
  console.log('\nTest 3: Testing streaming chat completion...');
  
  const testPayload = {
    model: CHUTES_AI_MODEL,
    messages: [
      {
        role: 'user',
        content: 'Count from 1 to 5 slowly'
      }
    ],
    max_tokens: 50,
    temperature: 0.1,
    stream: true,
  };

  try {
    const response = await fetch(`${CHUTES_AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHUTES_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    if (response.ok) {
      console.log('✅ Streaming connection established');
      console.log('   Streaming response chunks:');
      
      let receivedChunks = 0;
      let fullContent = '';
      
      for await (const chunk of response.body) {
        const chunkText = chunk.toString();
        receivedChunks++;
        
        // Parse SSE format
        if (chunkText.startsWith('data: ')) {
          const data = chunkText.slice(6);
          if (data === '[DONE]') {
            console.log('   Stream completed');
            break;
          }
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              process.stdout.write(content);
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
      
      console.log(`\n   Total chunks received: ${receivedChunks}`);
      console.log(`   Total content length: ${fullContent.length}`);
      return true;
    } else {
      console.error('❌ Streaming connection failed');
      console.error(`   Status: ${response.status}`);
      console.error(`   Status text: ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Streaming completion error');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Test 4: Test PR-Agent compatibility
async function testPRAgentCompatibility() {
  console.log('\nTest 4: Testing PR-Agent compatibility...');
  
  const codeReviewPayload = {
    model: CHUTES_AI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are an expert code reviewer. Review the following TypeScript code and provide feedback.'
      },
      {
        role: 'user',
        content: `Please review this TypeScript code:

function fetchData(url: string) {
  return fetch(url);
}

async function processData(data: any) {
  return data.map(item => ({
    ...item,
    processed: true
  }));
}`
      }
    ],
    max_tokens: 500,
    temperature: 0.1,
  };

  try {
    const response = await fetch(`${CHUTES_AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHUTES_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(codeReviewPayload),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      console.log('✅ PR-Agent compatibility test successful');
      console.log(`   Response length: ${content?.length || 0} characters`);
      console.log('   Sample response:');
      console.log(`   ${content?.substring(0, 100)}...`);
      return true;
    } else {
      console.error('❌ PR-Agent compatibility test failed');
      console.error(`   Status: ${response.status}`);
      console.error(`   Status text: ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.error('❌ PR-Agent compatibility error');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  const results = [];
  
  results.push(await testApiConnectivity());
  results.push(await testChatCompletion());
  results.push(await testStreamingCompletion());
  results.push(await testPRAgentCompatibility());
  
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`Tests passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Chutes AI integration is ready.');
    console.log('\nNext steps:');
    console.log('1. Create a test pull request to verify PR-Agent integration');
    console.log('2. Check the Actions tab in your GitHub repository');
    console.log('3. Review the AI-generated comments on your PR');
  } else {
    console.log('❌ Some tests failed. Please check the errors above and fix them before proceeding.');
    console.log('\nTroubleshooting tips:');
    console.log('1. Verify your Chutes AI deployment is running');
    console.log('2. Check your API key and base URL');
    console.log('3. Ensure the model is properly deployed');
    console.log('4. Check network connectivity');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the tests
runTests();