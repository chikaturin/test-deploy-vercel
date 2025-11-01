import { authenticate, isAdmin } from "../../../middleware/authMiddleware.js";
import { createTestUser, createTestAdmin } from "../../helpers/testHelpers.js";
import "../../setup/testSetup.js";

describe("Auth Middleware Tests", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe("authenticate", () => {
    test("Xác thực thành công với token hợp lệ", async () => {
      const user = await createTestUser();
      const { getAuthToken } = await import("../../helpers/testHelpers.js");
      const token = getAuthToken(user);

      req.headers.authorization = `Bearer ${token}`;

      await authenticate(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(user._id.toString());
      expect(next).toHaveBeenCalled();
    });

    test("Xác thực fail khi không có token", async () => {
      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test("Xác thực fail khi token không hợp lệ", async () => {
      req.headers.authorization = "Bearer invalid_token";

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("isAdmin", () => {
    test("Cho phép admin truy cập", async () => {
      const admin = await createTestAdmin();
      req.user = admin;

      await isAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test("Từ chối user thường truy cập", async () => {
      const user = await createTestUser();
      req.user = user;

      await isAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

