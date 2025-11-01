import request from "supertest";
import app from "../setup/testApp.js";
import {
  createTestUser,
  createTestAdmin,
  createTestRegistrationRequest,
  getAuthHeader,
} from "../helpers/testHelpers.js";
import RegistrationRequest from "../../models/RegistrationRequest.js";

describe("Registration Request API Tests", () => {
  describe("POST /api/auth/register/pharma-company", () => {
    test("Đăng ký pharma company thành công", async () => {
      const response = await request(app)
        .post("/api/auth/register/pharma-company")
        .send({
          username: "pharmacompany",
          email: "pharma@test.com",
          password: "password123",
          fullName: "Pharma Company",
          walletAddress: "0x1234567890123456789012345678901234567890",
          taxCode: "TAX123",
          licenseNo: "LIC123",
          name: "Test Pharma",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe("pharma_company");
      expect(response.body.data.user.status).toBe("pending");
      expect(response.body.data).toHaveProperty("registrationRequest");
    });

    test("Đăng ký pharma company thiếu wallet address sẽ fail", async () => {
      const response = await request(app)
        .post("/api/auth/register/pharma-company")
        .send({
          username: "pharma2",
          email: "pharma2@test.com",
          password: "password123",
          taxCode: "TAX123",
          licenseNo: "LIC123",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/register/distributor", () => {
    test("Đăng ký distributor thành công", async () => {
      const response = await request(app)
        .post("/api/auth/register/distributor")
        .send({
          username: "distributor",
          email: "dist@test.com",
          password: "password123",
          fullName: "Distributor",
          walletAddress: "0x1234567890123456789012345678901234567890",
          taxCode: "TAX456",
          licenseNo: "LIC456",
          name: "Test Distributor",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe("distributor");
    });
  });

  describe("POST /api/auth/register/pharmacy", () => {
    test("Đăng ký pharmacy thành công", async () => {
      const response = await request(app)
        .post("/api/auth/register/pharmacy")
        .send({
          username: "pharmacy",
          email: "pharmacy@test.com",
          password: "password123",
          fullName: "Pharmacy",
          walletAddress: "0x1234567890123456789012345678901234567890",
          taxCode: "TAX789",
          licenseNo: "LIC789",
          name: "Test Pharmacy",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe("pharmacy");
    });
  });

  describe("GET /api/auth/registration-requests", () => {
    test("Admin lấy danh sách registration requests thành công", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser({ role: "pharma_company", status: "pending" });
      await createTestRegistrationRequest(user);

      const response = await request(app)
        .get("/api/auth/registration-requests")
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test("Filter registration requests theo status", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser({ role: "pharma_company" });
      await createTestRegistrationRequest(user, { status: "pending" });

      const response = await request(app)
        .get("/api/auth/registration-requests?status=pending")
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      response.body.data.forEach((req) => {
        expect(req.status).toBe("pending");
      });
    });
  });

  describe("GET /api/auth/registration-requests/:requestId", () => {
    test("Admin lấy chi tiết registration request thành công", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser({ role: "pharma_company" });
      const request = await createTestRegistrationRequest(user);

      const response = await request(app)
        .get(`/api/auth/registration-requests/${request._id}`)
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(request._id.toString());
    });
  });

  describe("POST /api/auth/registration-requests/:requestId/approve", () => {
    test("Admin approve registration request thành công", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser({
        role: "pharma_company",
        walletAddress: "0x1234567890123456789012345678901234567890",
      });
      const request = await createTestRegistrationRequest(user);

      const response = await request(app)
        .post(`/api/auth/registration-requests/${request._id}/approve`)
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test("Approve request đã được xử lý sẽ fail", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser({ role: "pharma_company" });
      const request = await createTestRegistrationRequest(user, { status: "approved" });

      const response = await request(app)
        .post(`/api/auth/registration-requests/${request._id}/approve`)
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/registration-requests/:requestId/reject", () => {
    test("Admin reject registration request thành công", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser({ role: "pharma_company" });
      const request = await createTestRegistrationRequest(user);

      const response = await request(app)
        .post(`/api/auth/registration-requests/${request._id}/reject`)
        .set("Authorization", getAuthHeader(admin))
        .send({
          rejectionReason: "Thông tin không đầy đủ",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updatedRequest = await RegistrationRequest.findById(request._id);
      expect(updatedRequest.status).toBe("rejected");
    });
  });
});

