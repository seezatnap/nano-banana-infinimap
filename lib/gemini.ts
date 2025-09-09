import { GoogleGenAI } from '@google/genai'

console.log('🤖 Initializing Gemini AI client...');

const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  console.warn('⚠️ GEMINI_API_KEY environment variable is not set');
  console.warn('   AI generation will fail - please set GEMINI_API_KEY in your .env.local file');
} else {
  console.log('✅ GEMINI_API_KEY found, initializing AI client');
}

const ai = new GoogleGenAI({
  apiKey: apiKey,
});

console.log('🎯 Gemini AI client initialized successfully');
console.log('📚 Available models:', Object.keys(ai.models || {}));

export default ai