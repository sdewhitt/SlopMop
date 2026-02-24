/**
 * @jest-environment node
 */

// Unmock firebase for this test file since we're testing the API route, not client code
jest.unmock('../lib/firebase');

describe("/api/firebase-config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns Firebase config when all env vars are set", async () => {
    process.env.FIREBASE_API_KEY = "test-api-key";
    process.env.FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
    process.env.FIREBASE_PROJECT_ID = "test-project";
    process.env.FIREBASE_STORAGE_BUCKET = "test.appspot.com";
    process.env.FIREBASE_MESSAGING_SENDER_ID = "123456";
    process.env.FIREBASE_APP_ID = "1:123456:web:abc";

    const { GET } = await import("../api/firebase-config/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      apiKey: "test-api-key",
      authDomain: "test.firebaseapp.com",
      projectId: "test-project",
      storageBucket: "test.appspot.com",
      messagingSenderId: "123456",
      appId: "1:123456:web:abc",
    });
  });

  it("returns 500 when env vars are missing", async () => {
    delete process.env.FIREBASE_API_KEY;
    delete process.env.FIREBASE_AUTH_DOMAIN;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.FIREBASE_MESSAGING_SENDER_ID;
    delete process.env.FIREBASE_APP_ID;

    const { GET } = await import("../api/firebase-config/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Missing Firebase config");
  });
});
