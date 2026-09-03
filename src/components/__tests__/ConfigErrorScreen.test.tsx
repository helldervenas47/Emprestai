import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";

describe("ConfigErrorScreen", () => {
  it("renders the incomplete-config heading", () => {
    render(<ConfigErrorScreen missing={["VITE_EXTERNAL_SUPABASE_URL"]} />);
    expect(screen.getByText(/Configuração incompleta/i)).toBeInTheDocument();
  });

  it("lists each missing env var", () => {
    render(
      <ConfigErrorScreen
        missing={["VITE_EXTERNAL_SUPABASE_URL", "VITE_EXTERNAL_SUPABASE_ANON_KEY"]}
      />,
    );
    expect(
      screen.getByText("VITE_EXTERNAL_SUPABASE_URL"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("VITE_EXTERNAL_SUPABASE_ANON_KEY"),
    ).toBeInTheDocument();
  });

  it("renders reload instruction", () => {
    render(<ConfigErrorScreen missing={["FOO"]} />);
    expect(
      screen.getByText(/recarregue esta página/i),
    ).toBeInTheDocument();
  });
});
