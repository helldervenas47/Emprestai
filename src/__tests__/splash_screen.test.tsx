import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SplashScreen } from "../components/SplashScreen";

describe("SplashScreen Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza o nome e o símbolo oficial da marca", () => {
    render(<SplashScreen />);
    expect(screen.getByText("EmprestAI")).toBeDefined();
    const img = screen.getByAltText("EmprestAI");
    expect(img).toBeDefined();
  });

  it("completa o ciclo de animação em aproximadamente 1.8 segundos e chama onFinish", () => {
    const onFinish = vi.fn();
    const { container } = render(<SplashScreen onFinish={onFinish} />);

    expect(onFinish).not.toHaveBeenCalled();

    // Avança para 800ms
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(onFinish).not.toHaveBeenCalled();

    // Avança até 1800ms
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(container.firstChild).toBeNull();
  });
});
