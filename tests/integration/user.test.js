import request from "supertest";
import app from "../setup/testApp.js";
import "../setup/testSetup.js";
import {
  createTestUser,
  createTestAdmin,
  getAuthHeader,
} from "../helpers/testHelpers.js";
import User from "../../models/User.js";

describe("User API Tests", () => {
  describe("GET /api/users", () => {
    test("Admin lấy danh sách users thành công", async () => {
      const admin = await createTestAdmin();
      await createTestUser();
      await createTestUser();

      const response = await request(app)
        .get("/api/users")
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.users.length).toBeGreaterThan(0);
      expect(response.body.data).toHaveProperty("pagination");
    });

    test("User thường không thể lấy danh sách users", async () => {
      const user = await createTestUser();

      const response = await request(app)
        .get("/api/users")
        .set("Authorization", getAuthHeader(user));

      expect(response.status).toBe(403);
    });

    test("Lấy danh sách users với filter role", async () => {
      const admin = await createTestAdmin();
      await createTestUser({ role: "user" });
      await createTestUser({ role: "pharma_company" });

      const response = await request(app)
        .get("/api/users?role=user")
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      response.body.data.users.forEach((user) => {
        expect(user.role).toBe("user");
      });
    });

    test("Lấy danh sách users với pagination", async () => {
      const admin = await createTestAdmin();
      for (let i = 0; i < 5; i++) {
        await createTestUser();
      }

      const response = await request(app)
        .get("/api/users?page=1&limit=2")
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      expect(response.body.data.users.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.page).toBe(1);
    });
  });

  describe("GET /api/users/:id", () => {
    test("Lấy thông tin user theo ID thành công", async () => {
      const user = await createTestUser();
      const authUser = await createTestUser();

      const response = await request(app)
        .get(`/api/users/${user._id}`)
        .set("Authorization", getAuthHeader(authUser));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(user._id.toString());
    });

    test("Lấy thông tin user không tồn tại sẽ fail", async () => {
      const authUser = await createTestUser();
      const fakeId = "507f1f77bcf86cd799439011";

      const response = await request(app)
        .get(`/api/users/${fakeId}`)
        .set("Authorization", getAuthHeader(authUser));

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/users/profile", () => {
    test("Lấy profile của user hiện tại thành công", async () => {
      const user = await createTestUser();

      const response = await request(app)
        .get("/api/users/profile")
        .set("Authorization", getAuthHeader(user));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(user._id.toString());
    });
  });

  describe("PUT /api/users/profile", () => {
    test("Cập nhật profile thành công", async () => {
      const user = await createTestUser();

      const response = await request(app)
        .put("/api/users/profile")
        .set("Authorization", getAuthHeader(user))
        .send({
          fullName: "Updated Name",
          phone: "0987654321",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.fullName).toBe("Updated Name");
    });
  });

  describe("PUT /api/users/profile/change-password", () => {
    test("Đổi mật khẩu thành công", async () => {
      const user = await createTestUser({ password: "oldpass123" });

      const response = await request(app)
        .put("/api/users/profile/change-password")
        .set("Authorization", getAuthHeader(user))
        .send({
          oldPassword: "oldpass123",
          newPassword: "newpass123",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test("Đổi mật khẩu với old password sai sẽ fail", async () => {
      const user = await createTestUser();

      const response = await request(app)
        .put("/api/users/profile/change-password")
        .set("Authorization", getAuthHeader(user))
        .send({
          oldPassword: "wrongpassword",
          newPassword: "newpass123",
        });

      expect(response.status).toBe(401);
    });

    test("Đổi mật khẩu với mật khẩu mới quá ngắn sẽ fail", async () => {
      const user = await createTestUser();

      const response = await request(app)
        .put("/api/users/profile/change-password")
        .set("Authorization", getAuthHeader(user))
        .send({
          oldPassword: "password123",
          newPassword: "123",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("PUT /api/users/:id", () => {
    test("Admin cập nhật user thành công", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const response = await request(app)
        .put(`/api/users/${user._id}`)
        .set("Authorization", getAuthHeader(admin))
        .send({
          fullName: "Admin Updated Name",
          status: "inactive",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.fullName).toBe("Admin Updated Name");
    });
  });

  describe("PUT /api/users/:id/status", () => {
    test("Admin cập nhật status user thành công", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const response = await request(app)
        .put(`/api/users/${user._id}/status`)
        .set("Authorization", getAuthHeader(admin))
        .send({
          status: "banned",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("banned");
    });

    test("Cập nhật status với giá trị không hợp lệ sẽ fail", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const response = await request(app)
        .put(`/api/users/${user._id}/status`)
        .set("Authorization", getAuthHeader(admin))
        .send({
          status: "invalid_status",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/users/:id", () => {
    test("Admin xóa user thành công", async () => {
      const admin = await createTestAdmin();
      const user = await createTestUser();

      const response = await request(app)
        .delete(`/api/users/${user._id}`)
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const deletedUser = await User.findById(user._id);
      expect(deletedUser).toBeNull();
    });

    test("Không thể xóa chính mình", async () => {
      const admin = await createTestAdmin();

      const response = await request(app)
        .delete(`/api/users/${admin._id}`)
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/users/stats", () => {
    test("Admin lấy thống kê users thành công", async () => {
      const admin = await createTestAdmin();
      await createTestUser({ role: "user" });
      await createTestUser({ role: "pharma_company" });

      const response = await request(app)
        .get("/api/users/stats")
        .set("Authorization", getAuthHeader(admin));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("total");
      expect(response.body.data).toHaveProperty("byRole");
      expect(response.body.data).toHaveProperty("byStatus");
    });
  });
});

