const { app } = require('./graph/workflow');
const { ENV_PATH, getSiteIndexPath, getSiteScreenshotPath } = require('./config/paths');
require('dotenv').config({ path: ENV_PATH });

async function main() {
  const prompt = process.argv[2] || 'a modern bakery landing page with artisanal sourdough, product gallery, testimonials, and a contact form';
  const siteName = process.argv[3] || 'site1';

  console.log('🚀 Starting Multi-Agent AI Website Builder (LangGraph Orchestrated CLI)...');
  console.log(`Prompt: "${prompt}"`);
  console.log(`Site Name: "${siteName}"`);

  const finalState = await app.invoke({
    prompt,
    siteName,
    maxIterations: 2
  });

  console.log('\n======================================================');
  console.log('🎉 WORKFLOW COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
  console.log(`📁 File Location: ${finalState.filePath}`);
  console.log(`📸 Screenshot:    ${finalState.screenshotPath}`);
  console.log(`📊 Final Scores: `, finalState.report?.scores);
  console.log(`🔄 Total Loops:   ${finalState.iteration}`);

  if (finalState.previewUrl) {
    console.log(`\n🌐 Live Preview:  ${finalState.previewUrl}`);
    console.log(`\n💡 The preview server is running. Press Ctrl+C to stop.`);
  }
}

main().catch(err => {
  console.error('Fatal workflow error:', err);
  process.exit(1);
});

