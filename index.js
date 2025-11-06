import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import pharmaCompanyRoutes from "./routes/pharmaCompanyRoutes.js";
import distributorRoutes from "./routes/distributorRoutes.js";
import pharmacyRoutes from "./routes/pharmacyRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { listenToDistributorToPharmacyEvent } from "./services/eventListenerService.js";
import publicRoute from "./routes/publicRoutes.js";
import cors from "cors"

dotenv.config();

const app = express();

  app.use(cors());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/pharma-company", pharmaCompanyRoutes);
app.use("/api/distributor", distributorRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/publicRoute" , publicRoute);

app.get("/", (req, res) => {
  res.json({ message: "Drug Traceability Backend API" });
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Đã kết nối MongoDB thành công");
    
    app.listen(PORT, () => {
      console.log(`Server đang chạy trên port ${PORT}`);
      
      // Khởi động event listener sau khi server đã chạy
      try {
        listenToDistributorToPharmacyEvent()
          .then(() => {
            console.log("Event listener đã được khởi động thành công");
          })
          .catch((error) => {
            console.error("Lỗi khi khởi động event listener:", error);
          });
      } catch (error) {
        console.error("Lỗi khi khởi động event listener:", error);
      }
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

