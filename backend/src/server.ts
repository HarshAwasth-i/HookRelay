import dotenv from "dotenv";

const result = dotenv.config({
  path: `${process.cwd()}/.env`,
});

console.log("Current directory:", process.cwd());
console.log("Dotenv error:", result.error?.message ?? "none");
console.log("Password loaded:", Boolean(process.env.DB_PASSWORD));

import app from "./app";
import pool from "./config/db";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const connection = await pool.getConnection();

    console.log("MySQL connected successfully!");

    connection.release();

    app.listen(PORT, () => {
      console.log(`HookRelay server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to MySQL:", error);
    process.exit(1);
  }
}

startServer();
