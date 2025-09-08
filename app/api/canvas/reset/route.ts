import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST() {
  try {
    // Define the directories to clear
    const directories = [
      '.tiles',    // Generated tile images
      '.meta',     // Tile metadata
      '.locks',    // Lock files
      '.queue'     // Queue state
    ];

    // Clear each directory
    for (const dir of directories) {
      try {
        const dirPath = path.resolve(process.cwd(), dir);
        
        // Check if directory exists
        try {
          await fs.access(dirPath);
          
          // Read all files in the directory
          const files = await fs.readdir(dirPath);
          
          // Delete all files
          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isDirectory()) {
              // Recursively delete subdirectories
              await fs.rm(filePath, { recursive: true, force: true });
            } else {
              // Delete file
              await fs.unlink(filePath);
            }
          }
          
          console.log(`✅ Cleared directory: ${dir}`);
        } catch (error) {
          // Directory doesn't exist, which is fine
          console.log(`📁 Directory doesn't exist: ${dir}`);
        }
      } catch (error) {
        console.error(`❌ Failed to clear directory ${dir}:`, error);
        // Continue with other directories even if one fails
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Canvas reset successfully. All tiles and data cleared." 
    });

  } catch (error) {
    console.error("Failed to reset canvas:", error);
    return NextResponse.json(
      { error: "Failed to reset canvas" },
      { status: 500 }
    );
  }
}
