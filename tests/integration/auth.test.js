import request from "supertest";
import app from "../setup/testApp.js";
import "../setup/testSetup.js";
import {
  createTestUser,
  createTestAdmin,
  getAuthToken,
} from "../helpers/testHelpers.js";
import User from "../../models/User.js";

describe("Auth API Tests", () => {
  describe("POST /api/auth/register/user", () => {
    test("Đăng ký user thành công", async () => {
      const response = await request(app)
        .post("/api/auth/register/user")
        .send({
          username: "newuser",
          email: "newuser@test.com",
          password: "password123",
          fullName: "New User",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("username", "newuser");
      expect(response.body.data).not.toHaveProperty("password");
    });

    test("Đăng ký user với email trùng lặp sẽ fail", async () => {
      await createTestUser({ email: "duplicate@test.com" });

      const response = await request(app)
        .post("/api/auth/register/user")
        .send({
          username: "newuser2",
          email: "duplicate@test.com",
          password: "password123",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("Đăng ký user thiếu thông tin bắt buộc sẽ fail", async () => {
      const response = await request(app)
        .post("/api/auth/register/user")
        .send({
          username: "newuser",
          email: "newuser@test.com",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/register/admin", () => {
    test("Đăng ký admin thành công", async () => {
      const response = await request(app)
        .post("/api/auth/register/admin")
        .send({
          username: "newadmin",
          email: "admin@test.com",
          password: "password123",
          fullName: "New Admin",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe("system_admin");
      expect(response.body.data.isAdmin).toBe(true);
    });
  });

  describe("POST /api/auth/login", () => {
    test("Login thành công với email và password đúng", async () => {
      const user = await createTestUser({
        email: "login@test.com",
      });

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "login@test.com",
          password: "password123",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("token");
      expect(response.body.data).toHaveProperty("user");
    });

    test("Login fail với password sai", async () => {
      await createTestUser({
        email: "login2@test.com",
      });

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "login2@test.com",
          password: "wrongpassword",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("Login fail với email không tồn tại", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "notexist@test.com",
          password: "password123",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("Login fail với tài khoản pending", async () => {
      await createTestUser({
        email: "pending@test.com",
        status: "pending",
      });

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "pending@test.com",
          password: "password123",
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/auth/me", () => {
    test("Lấy thông tin user hiện tại thành công", async () => {
      const user = await createTestUser();
      const token = getAuthToken(user);

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user._id.toString()).toBe(user._id.toString());
    });

    test("Lấy thông tin user không có token sẽ fail", async () => {
      const response = await request(app).get("/api/auth/me");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/logout", () => {
    test("Logout thành công", async () => {
      const user = await createTestUser();
      const token = getAuthToken(user);

      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

