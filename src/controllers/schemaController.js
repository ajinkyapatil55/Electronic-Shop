// ================================================================
// schemaController.js
// ================================================================

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// ================================================================
// GENERATE MYSQL SCHEMA DUMP
// ================================================================
// @desc    Export structure-only MySQL schema using mysqldump
// @route   POST /api/schema/rest_api_generate_schema
// @access  Protected
// ================================================================
exports.generateSchemaDump = async (req, res) => {
    let child = null;
    let writeStream = null;

    try {
        // ============================================================
        // 1. GET REQUEST DATA
        // ============================================================
        const {
            dumpPath,
            host,
            port,
            username,
            password,
            database,
            outputPath
        } = req.body;

        console.log("\n");
        console.log("=================================================");
        console.log("📦 SQL SCHEMA DUMP REQUEST");
        console.log("=================================================");
        console.log("Dump Path    :", dumpPath);
        console.log("Host         :", host);
        console.log("Port         :", port);
        console.log("Username     :", username);
        console.log("Database     :", database);
        console.log("Output Folder:", outputPath);
        console.log("=================================================");

        // ============================================================
        // 2. VALIDATE REQUIRED FIELDS
        // ============================================================
        const missingFields = [];

        if (!dumpPath) missingFields.push("dumpPath");
        if (!host) missingFields.push("host");
        if (!port) missingFields.push("port");
        if (!username) missingFields.push("username");
        if (!database) missingFields.push("database");
        if (!outputPath) missingFields.push("outputPath");

        if (missingFields.length > 0) {
            console.warn(
                "⚠️ Missing fields:",
                missingFields.join(", ")
            );

            return res.status(400).json({
                success: false,
                message: "Required fields are missing.",
                missingFields
            });
        }

        // ============================================================
        // 3. VALIDATE MYSQLDUMP.EXE
        // ============================================================
        const resolvedDumpPath = path.resolve(dumpPath);

        console.log("\n🔍 Checking mysqldump.exe...");
        console.log("Path:", resolvedDumpPath);

        if (!fs.existsSync(resolvedDumpPath)) {
            console.error(
                "❌ mysqldump.exe not found:",
                resolvedDumpPath
            );

            return res.status(400).json({
                success: false,
                message: "mysqldump.exe was not found.",
                dumpPath: resolvedDumpPath
            });
        }

        const dumpStats = fs.statSync(resolvedDumpPath);

        if (!dumpStats.isFile()) {
            return res.status(400).json({
                success: false,
                message: "dumpPath must point to mysqldump.exe."
            });
        }

        // ============================================================
        // 4. OUTPUT PATH IS A FOLDER
        // ============================================================
        const outputFolder = path.resolve(outputPath);

        console.log("\n📁 Output Folder:", outputFolder);

        // Create folder if it does not exist
        if (!fs.existsSync(outputFolder)) {
            console.log("📂 Folder does not exist.");
            console.log("📂 Creating folder...");

            try {
                fs.mkdirSync(outputFolder, {
                    recursive: true
                });

                console.log("✅ Output folder created.");
            } catch (folderError) {
                console.error(
                    "❌ Failed to create output folder:",
                    folderError.message
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to create output folder.",
                    error: folderError.message
                });
            }
        }

        // ============================================================
        // 5. MAKE SURE OUTPUT PATH IS A DIRECTORY
        // ============================================================
        const outputStats = fs.statSync(outputFolder);

        if (!outputStats.isDirectory()) {
            console.error(
                "❌ Output path is not a directory:",
                outputFolder
            );

            return res.status(400).json({
                success: false,
                message:
                    "Output path must be a folder, for example E:\\sql"
            });
        }

        // ============================================================
        // 6. CREATE SAFE SQL FILE NAME
        // ============================================================
        const safeDatabaseName = String(database).replace(
            /[<>:"/\\|?*\x00-\x1F]/g,
            "_"
        );

        const outputFileName =
            `${safeDatabaseName}_schema.sql`;

        const finalOutputPath = path.join(
            outputFolder,
            outputFileName
        );

        console.log("📄 SQL File:", finalOutputPath);

        // ============================================================
        // 7. MYSQLDUMP ARGUMENTS
        // ============================================================
        const args = [
            `--host=${host}`,
            `--port=${port}`,
            `--user=${username}`,
            "--no-data",
            database
        ];

        console.log("\n🚀 Starting mysqldump...");
        console.log("Executable:", resolvedDumpPath);
        console.log("Database:", database);

        // ============================================================
        // 8. MYSQL PASSWORD THROUGH ENVIRONMENT VARIABLE
        // ============================================================
        const env = {
            ...process.env
        };

        if (password) {
            env.MYSQL_PWD = password;
        }

        // ============================================================
        // 9. CREATE OUTPUT STREAM
        // ============================================================
        writeStream = fs.createWriteStream(
            finalOutputPath
        );

        let stderr = "";
        let responseSent = false;

        // ============================================================
        // HELPER: SEND RESPONSE ONLY ONCE
        // ============================================================
        const sendResponse = (statusCode, data) => {

            if (responseSent || res.headersSent) {
                return;
            }

            responseSent = true;

            return res.status(statusCode).json(data);
        };

        // ============================================================
        // 10. HANDLE FILE WRITE ERROR
        // ============================================================
        writeStream.on("error", (error) => {

            console.error(
                "❌ SQL FILE WRITE ERROR:",
                error.message
            );

            if (child) {
                try {
                    child.kill();
                } catch (_) {}
            }

            if (fs.existsSync(finalOutputPath)) {
                try {
                    fs.unlinkSync(finalOutputPath);
                } catch (_) {}
            }

            sendResponse(500, {
                success: false,
                message:
                    "Failed to write SQL schema file.",
                error: error.message
            });
        });

        // ============================================================
        // 11. START MYSQLDUMP
        // ============================================================
        child = spawn(
            resolvedDumpPath,
            args,
            {
                env,
                windowsHide: true,
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe"
                ]
            }
        );

        // ============================================================
        // 12. CAPTURE STDERR
        // ============================================================
        child.stderr.on("data", (chunk) => {

            stderr += chunk.toString();

        });

        // ============================================================
        // 13. IMPORTANT
        //
        // end:false prevents stdout from automatically closing
        // the SQL file stream.
        //
        // We manually close the stream after mysqldump finishes.
        // ============================================================
        child.stdout.pipe(
            writeStream,
            {
                end: false
            }
        );

        // ============================================================
        // 14. PROCESS ERROR
        // ============================================================
        child.on("error", (error) => {

            console.error(
                "❌ MYSQLDUMP PROCESS ERROR:",
                error.message
            );

            if (writeStream) {
                writeStream.destroy();
            }

            if (fs.existsSync(finalOutputPath)) {
                try {
                    fs.unlinkSync(finalOutputPath);
                } catch (_) {}
            }

            sendResponse(500, {
                success: false,
                message:
                    "Failed to execute mysqldump.exe.",
                error: error.message
            });
        });

        // ============================================================
        // 15. MYSQLDUMP CLOSE EVENT
        // ============================================================
        child.on("close", (code) => {

            console.log(
                "🏁 mysqldump exited with code:",
                code
            );

            // ========================================================
            // FAILED
            // ========================================================
            if (code !== 0) {

                console.error(
                    "❌ MYSQLDUMP FAILED"
                );

                console.error(
                    "Error:",
                    stderr || "Unknown mysqldump error"
                );

                if (writeStream) {
                    writeStream.destroy();
                }

                // Delete incomplete file
                if (fs.existsSync(finalOutputPath)) {
                    try {
                        fs.unlinkSync(finalOutputPath);
                    } catch (_) {}
                }

                return sendResponse(500, {
                    success: false,
                    message:
                        "Failed to generate SQL schema dump.",
                    error:
                        stderr ||
                        `mysqldump exited with code ${code}`
                });
            }

            // ========================================================
            // SUCCESS
            // ========================================================
            console.log(
                "✅ mysqldump completed successfully."
            );

            console.log(
                "📄 Closing SQL output stream..."
            );

            // IMPORTANT:
            // Because pipe() uses { end:false },
            // we must manually end the stream.
            writeStream.end();

            // ========================================================
            // WAIT UNTIL FILE IS COMPLETELY WRITTEN
            // ========================================================
            writeStream.once("finish", () => {

                console.log(
                    "✅ SQL file write completed."
                );

                // ====================================================
                // VERIFY FILE EXISTS
                // ====================================================
                if (!fs.existsSync(finalOutputPath)) {

                    console.error(
                        "❌ SQL file was not created."
                    );

                    return sendResponse(500, {
                        success: false,
                        message:
                            "mysqldump completed but SQL file was not created."
                    });
                }

                // ====================================================
                // GET FILE INFORMATION
                // ====================================================
                let fileSize = 0;

                try {
                    const stats =
                        fs.statSync(finalOutputPath);

                    fileSize = stats.size;
                } catch (error) {

                    console.error(
                        "❌ Unable to read SQL file:",
                        error.message
                    );
                }

                // ====================================================
                // SUCCESS LOG
                // ====================================================
                console.log("");
                console.log(
                    "================================================="
                );
                console.log(
                    "✅ SQL SCHEMA DUMP CREATED SUCCESSFULLY"
                );
                console.log(
                    "================================================="
                );
                console.log(
                    "Database     :",
                    database
                );
                console.log(
                    "Output Folder:",
                    outputFolder
                );
                console.log(
                    "SQL File     :",
                    finalOutputPath
                );
                console.log(
                    "File Size    :",
                    fileSize,
                    "bytes"
                );
                console.log(
                    "================================================="
                );
                console.log("");

                // ====================================================
                // SEND RESPONSE TO REACT
                // ====================================================
                return sendResponse(200, {

                    success: true,

                    message:
                        "SQL schema dump successfully generated.",

                    database: database,

                    outputFolder:
                        outputFolder,

                    outputFile:
                        finalOutputPath,

                    fileSize:
                        fileSize
                });
            });
        });

    } catch (error) {

        console.error(
            "❌ CONTROLLER EXCEPTION:",
            error.message
        );

        // Close stream if something unexpected happens
        if (writeStream) {
            try {
                writeStream.destroy();
            } catch (_) {}
        }

        // Kill process if still running
        if (child) {
            try {
                child.kill();
            } catch (_) {}
        }

        // Delete incomplete file
        try {
            if (
                typeof finalOutputPath !== "undefined" &&
                fs.existsSync(finalOutputPath)
            ) {
                fs.unlinkSync(finalOutputPath);
            }
        } catch (_) {}

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message:
                    "Internal server error during schema generation.",
                error: error.message
            });
        }
    }
};