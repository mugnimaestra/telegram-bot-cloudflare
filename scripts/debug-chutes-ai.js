#!/usr/bin/env node

/**
 * Debug script for Chutes AI API structure
 * This script tests different endpoint patterns to find the correct API structure
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

console.log('🔍 Debugging Chutes AI API Structure');
console.log('===================================\n');
console.log('Configuration:');
console.log(`Base URL: ${CHUTES_AI_BASE_URL}`);
console.log(`Model: ${CHUTES_AI_MODEL}`);
console.log(`API Key: ${CHUTES_AI_API_KEY ? '***' + CHUTES_AI_API_KEY.slice(-10) : 'Not set'}\n`);

// Test different endpoint patterns
async function testEndpointPatterns() {
  const endpoints = [
    // Standard OpenAI patterns
    '/models',
    '/chat/completions',
    '/v1/models',
    '/v1/chat/completions',
    // Alternative patterns
    '/api/models',
    '/api/chat/completions',
    '/llm/models',
    '/llm/chat/completions'
  ];

  for (const endpoint of endpoints) {
    console.log(`\n🧪 Testing endpoint: ${endpoint}`);
    
    try {
      // Try GET request for model endpoints
      if (endpoint.includes('models')) {
        const response = await fetch(`${CHUTES_AI_BASE_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${CHUTES_AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        console.log(`   Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('   ✅ Success!');
          console.log(`   Response: ${JSON.stringify(data, null, 2).substring(0, 200)}...`);
        } else {
          const errorText = await response.text();
          console.log(`   ❌ Failed: ${errorText.substring(0, 100)}...`);
        }
      }
      
      // Try POST request for chat endpoints
      if (endpoint.includes('chat')) {
        const testPayload = {
          model: CHUTES_AI_MODEL,
          messages: [
            {
              role: 'user',
              content: 'Hello! Please respond with "test"'
            }
          ],
          max_tokens: 10,
          temperature: 0.1,
        };

        const response = await fetch(`${CHUTES_AI_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CHUTES_AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testPayload),
        });

        console.log(`   Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('   ✅ Success!');
          console.log(`   Response: ${JSON.stringify(data, null, 2).substring(0, 200)}...`);
        } else {
          const errorText = await response.text();
          console.log(`   ❌ Failed: ${errorText.substring(0, 100)}...`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

// Test base URL variations
async function testBaseUrlVariations() {
  console.log('\n\n🔗 Testing Base URL Variations');
  console.log('===============================\n');
  
  const baseUrlVariations = [
    CHUTES_AI_BASE_URL,
    'https://llm.chutes.ai',
    'https://api.chutes.ai',
    'https://chutes.ai/api',
    'https://chutes.ai/v1'
  ];
  
  const testEndpoint = '/chat/completions';
  const testPayload = {
    model: CHUTES_AI_MODEL,
    messages: [
      {
        role: 'user',
        content: 'Hello! Please respond with "test"'
      }
    ],
    max_tokens: 10,
    temperature: 0.1,
  };

  for (const baseUrl of baseUrlVariations) {
    console.log(`\n🧪 Testing base URL: ${baseUrl}`);
    
    try {
      const response = await fetch(`${baseUrl}${testEndpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CHUTES_AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('   ✅ Success!');
        console.log(`   Response: ${JSON.stringify(data, null, 2).substring(0, 200)}...`);
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Failed: ${errorText.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

// Test authentication methods
async function testAuthenticationMethods() {
  console.log('\n\n🔐 Testing Authentication Methods');
  console.log('==================================\n');
  
  const authMethods = [
    { name: 'Bearer token', headers: { 'Authorization': `Bearer ${CHUTES_AI_API_KEY}` } },
    { name: 'API Key header', headers: { 'X-API-Key': CHUTES_AI_API_KEY } },
    { name: 'Custom header', headers: { 'Authorization': CHUTES_AI_API_KEY } },
    { name: 'Basic auth', headers: { 'Authorization': `Basic ${Buffer.from(CHUTES_AI_API_KEY).toString('base64')}` } }
  ];
  
  const testUrl = `${CHUTES_AI_BASE_URL}/chat/completions`;
  const testPayload = {
    model: CHUTES_AI_MODEL,
    messages: [
      {
        role: 'user',
        content: 'Hello! Please respond with "test"'
      }
    ],
    max_tokens: 10,
    temperature: 0.1,
  };

  for (const method of authMethods) {
    console.log(`\n🧪 Testing auth method: ${method.name}`);
    
    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...method.headers
        },
        body: JSON.stringify(testPayload),
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('   ✅ Success!');
        console.log(`   Response: ${JSON.stringify(data, null, 2).substring(0, 200)}...`);
      } else {
        const errorText = await response.text();
        console.log(`   ❌ Failed: ${errorText.substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

// Main debug runner
async function runDebug() {
  await testEndpointPatterns();
  await testBaseUrlVariations();
  await testAuthenticationMethods();
  
  console.log('\n\n📋 Debug Summary');
  console.log('================');
  console.log('Check the results above to identify:');
  console.log('1. Which endpoint pattern works');
  console.log('2. Which base URL is correct');
  console.log('3. Which authentication method is accepted');
  console.log('\nUpdate your .env file with the correct configuration.');
}

runDebug().catch(console.error);