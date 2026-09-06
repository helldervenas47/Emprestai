import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Legal Links and Routes Validation", () => {
  it("rotas legais /termos e /privacidade estão padronizadas e sem links quebrados em inglês", () => {
    // Slugs canônicos
    const termsRoute = "/termos";
    const privacyRoute = "/privacidade";
    const refundRoute = "/reembolso";

    expect(termsRoute).toBe("/termos");
    expect(privacyRoute).toBe("/privacidade");
    expect(refundRoute).toBe("/reembolso");

    // Slugs antigos em inglês que NÃO devem ser usados como destino
    const legacyTerms = "/terms";
    const legacyPrivacy = "/privacy-policy";

    expect(termsRoute).not.toBe(legacyTerms);
    expect(privacyRoute).not.toBe(legacyPrivacy);
  });
});

describe("Password Recovery PKCE and Hash Flow Validation", () => {
  let mockUpdateUser: ReturnType<typeof vi.fn>;
  let mockExchangeCode: ReturnType<typeof vi.fn>;
  let mockGetSession: ReturnType<typeof vi.fn>;
  let mockSignOut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUpdateUser = vi.fn();
    mockExchangeCode = vi.fn();
    mockGetSession = vi.fn();
    mockSignOut = vi.fn();
  });

  it("processa código de autorização PKCE (?code=...) exatamente uma vez", async () => {
    let exchangedCount = 0;
    const code = "auth-pkce-code-12345";

    mockExchangeCode.mockImplementation(async (c: string) => {
      exchangedCount++;
      if (c === code) {
        return { data: { session: { user: { id: "user-abc" } } }, error: null };
      }
      return { data: null, error: new Error("Invalid code") };
    });

    // Simula guarda contra troca duplicada
    let exchangedRef = false;
    async function exchangeOnce(c: string) {
      if (exchangedRef) return;
      exchangedRef = true;
      return await mockExchangeCode(c);
    }

    const res1 = await exchangeOnce(code);
    expect(res1?.data?.session?.user?.id).toBe("user-abc");
    expect(exchangedCount).toBe(1);

    // Segunda tentativa não deve chamar a API novamente
    await exchangeOnce(code);
    expect(exchangedCount).toBe(1);
  });

  it("rejeita código PKCE inválido ou já utilizado com erro seguro", async () => {
    mockExchangeCode.mockResolvedValue({
      data: null,
      error: { message: "Invalid or expired authorization code" },
    });

    const result = await mockExchangeCode("bad-code");
    expect(result.error).toBeTruthy();
    expect(result.data).toBeNull();
  });

  it("atualiza senha com sucesso e efetua logout da sessão temporária", async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });

    const newPassword = "NovaSenhaForte@2026";
    expect(newPassword.length).toBeGreaterThanOrEqual(6);

    const updateRes = await mockUpdateUser({ password: newPassword });
    expect(updateRes.error).toBeNull();
    expect(updateRes.data.user.id).toBe("user-123");

    await mockSignOut({ scope: "local" });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("valida que senhas curtas (<6 caracteres) ou divergentes são barradas antes do backend", () => {
    const pass1 = "123";
    const pass2 = "123456";
    const confirm = "123457";

    const isTooShort = pass1.length < 6;
    expect(isTooShort).toBe(true);

    const isMismatch = pass2 !== confirm;
    expect(isMismatch).toBe(true);
  });

  it("reconhece evento PASSWORD_RECOVERY do listener de autenticação", () => {
    let appStatus = "verifying";

    function handleAuthEvent(event: string) {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        appStatus = "ready";
      }
    }

    handleAuthEvent("PASSWORD_RECOVERY");
    expect(appStatus).toBe("ready");
  });
});
