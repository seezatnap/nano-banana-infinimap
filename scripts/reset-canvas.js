#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

/**
 * Script to reset the canvas by clearing all generated tiles and data
 * Usage: node scripts/reset-canvas.js
 */

async function resetCanvas() {
  console.log('🎨 Resetting canvas...\n');

  const directories = [
    '.tiles',    // Generated tile images
    '.meta',     // Tile metadata
    '.locks',    // Lock files
    '.queue'     // Queue state
  ];

  let clearedCount = 0;
  let totalFiles = 0;

  for (const dir of directories) {
    try {
      const dirPath = path.resolve(process.cwd(), dir);
      
      try {
        await fs.access(dirPath);
        
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        const fileCount = files.length;
        totalFiles += fileCount;
        
        if (fileCount > 0) {
          // Delete all files and subdirectories
          for (const file of files) {
            const filePath = path.join(dirPath, file.name);
            
            if (file.isDirectory()) {
              await fs.rm(filePath, { recursive: true, force: true });
            } else {
              await fs.unlink(filePath);
            }
          }
          
          console.log(`✅ Cleared ${fileCount} items from ${dir}/`);
          clearedCount++;
        } else {
          console.log(`📁 ${dir}/ already empty`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`📁 ${dir}/ doesn't exist (nothing to clear)`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(`❌ Failed to clear ${dir}/:`, error.message);
    }
  }

  console.log(`\n🎉 Canvas reset complete!`);
  console.log(`   Cleared ${totalFiles} total files from ${clearedCount} directories`);
  console.log(`   Your canvas is now ready for a fresh start.\n`);
}

// Run the script
resetCanvas().catch(error => {
  console.error('❌ Failed to reset canvas:', error);
  process.exit(1);
});
