const { ENV_PATH } = require('../config/paths');
require('dotenv').config({ path: ENV_PATH });
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callLLM(prompt) {
  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [{ role: 'user', content: prompt }],
  });

  let text = completion.choices[0].message.content;
  text = text.replace(/```html|```json|```/g, '').trim();
  return text;
}

module.exports = { callLLM };

