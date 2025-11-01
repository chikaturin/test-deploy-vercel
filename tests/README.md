# Test Documentation

Thư mục này chứa các test automation cho Drug Traceability Backend API.

## Cấu trúc thư mục

```
tests/
├── setup/           # Cấu hình test setup
│   ├── testSetup.js    # MongoDB connection và cleanup
│   └── testApp.js      # Express app cho testing
├── helpers/         # Helper functions
│   └── testHelpers.js  # Functions tạo mock data
├── integration/     # Integration tests
│   ├── auth.test.js
│   ├── user.test.js
│   └── registration.test.js
└── unit/           # Unit tests
    ├── utils/
    └── middleware/
```

## Chạy tests

```bash
# Chạy tất cả tests
npm test

# Chạy tests với watch mode
npm run test:watch

# Chạy tests với coverage
npm run test:coverage
```

## Yêu cầu

- MongoDB phải được chạy và có thể kết nối
- Tạo file `.env.test` với cấu hình test database:
  ```
  TEST_MONGODB_URI=mongodb://localhost:27017/drug_be_test
  JWT_SECRET=test_secret_key
  ```

## Test Structure

### Integration Tests
Test các API endpoints với database thực tế:
- Auth API: login, register, authentication
- User API: CRUD operations
- Registration API: business registration và approval

### Unit Tests
Test các functions và modules riêng lẻ:
- JWT utilities
- Middleware functions
- Helper functions

## Mock Data
Sử dụng `testHelpers.js` để tạo mock data:
- `createTestUser()` - Tạo test user
- `createTestAdmin()` - Tạo test admin
- `createTestPharmaCompany()` - Tạo pharma company
- `getAuthToken()` - Tạo JWT token
- `getAuthHeader()` - Tạo Authorization header

