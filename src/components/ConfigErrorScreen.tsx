interface ConfigErrorScreenProps {
  missing: string[];
}

export function ConfigErrorScreen({ missing }: ConfigErrorScreenProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#0f172a",
        color: "#f8fafc",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 28,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚙️</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
          Configuração incompleta
        </h1>
        <p style={{ margin: "0 0 16px", color: "#cbd5e1", lineHeight: 1.5 }}>
          O aplicativo não pôde iniciar porque as variáveis de ambiente do
          Supabase não estão configuradas. Defina os valores abaixo no seu
          arquivo <code>.env</code> (veja <code>.env.example</code>) e recarregue
          a página.
        </p>
        <ul
          style={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "12px 16px 12px 32px",
            margin: "0 0 16px",
            color: "#fca5a5",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
          }}
        >
          {missing.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
          Após configurar as variáveis, recarregue esta página.
        </p>
      </div>
    </div>
  );
}
