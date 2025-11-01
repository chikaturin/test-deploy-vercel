import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import pharmaCompanyRoutes from "./routes/pharmaCompanyRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/drug_be";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/pharma-company", pharmaCompanyRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Drug Traceability Backend API" });
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Đã kết nối MongoDB thành công");
    
    app.listen(PORT, () => {
      console.log(`Server đang chạy trên port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Lỗi kết nối MongoDB:", error);
    process.exit(1);
  });

app.use((err, req, res, next) => {
  console.error("Lỗi:", err);
  res.status(500).json({
    success: false,
    message: "Lỗi server",
    error: err.message,
  });
});

export default app;

