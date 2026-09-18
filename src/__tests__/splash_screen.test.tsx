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

  it("completa o ciclo de animação chamando onStartExit aos 1450ms e onFinish aos 2050ms", () => {
    const onStartExit = vi.fn();
    const onFinish = vi.fn();
    const { container } = render(<SplashScreen onStartExit={onStartExit} onFinish={onFinish} />);

    expect(onStartExit).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();

    // Avança para 1200ms (fase de estabilização viva)
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onStartExit).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();

    // Avança até 1450ms (início do crossfade simultâneo)
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onStartExit).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();

    // Avança os 600ms do crossfade até 2050ms (término e desmontagem)
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(container.firstChild).toBeNull();
  });
});
