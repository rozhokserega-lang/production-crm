import { renderHook, waitFor, act } from "@testing-library/react";
import { useCrmRole } from "./useCrmRole";
import { supabaseSignInWithPassword } from "../api";

vi.mock("../api", () => ({
  getSupabaseAuthUser: vi.fn(() => null),
  supabaseSignInWithPassword: vi.fn(),
  supabaseSignOut: vi.fn(),
}));

describe("useCrmRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createCallBackendMock(role = "admin") {
    return vi.fn(async (action) => {
      if (action === "webGetCrmAuthStrict") return true;
      if (action === "webGetMyRole") return role;
      if (action === "webListCrmUserRoles") return [{ user_id: "u1", role: "manager" }];
      if (action === "webGetAuditLog") return [];
      if (action === "webSetCrmUserRole") return { ok: true };
      return null;
    });
  }

  it("loads strict mode and current CRM role", async () => {
    const callBackend = createCallBackendMock("admin");

    const { result } = renderHook(() =>
      useCrmRole({
        view: "workshop",
        callBackend,
        toUserError: (e) => String(e?.message || e),
        authEnabled: true,
        load: vi.fn(),
        setError: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.crmRole).toBe("admin");
      expect(result.current.crmAuthStrict).toBe(true);
    });
  });

  it("does not create CRM role for non-admin users", async () => {
    const setError = vi.fn();
    const callBackend = createCallBackendMock("viewer");

    const { result } = renderHook(() =>
      useCrmRole({
        view: "workshop",
        callBackend,
        toUserError: (e) => String(e?.message || e),
        authEnabled: true,
        load: vi.fn(),
        setError,
      })
    );

    act(() => {
      result.current.setNewCrmUserId("not-a-uuid");
    });

    await act(async () => {
      await result.current.createCrmUserRole();
    });

    expect(setError).not.toHaveBeenCalledWith("Укажите корректный user_id (UUID).");
    expect(callBackend).not.toHaveBeenCalledWith("webSetCrmUserRole", expect.anything());
  });

});
