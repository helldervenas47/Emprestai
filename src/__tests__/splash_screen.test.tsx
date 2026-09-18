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

  it("completa o ciclo de animação chamando onStartExit aos 2250ms e onFinish aos 2750ms", () => {
    const onStartExit = vi.fn();
    const onFinish = vi.fn();
    const { container } = render(<SplashScreen onStartExit={onStartExit} onFinish={onFinish} />);

    expect(onStartExit).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();

    // Avança para 1650ms (término da animação da logo -> início da estabilização)
    act(() => {
      vi.advanceTimersByTime(1650);
    });
    expect(onStartExit).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();

    // Avança 600ms até 2250ms (início do crossfade simultâneo de 500ms)
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onStartExit).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();

    // Avança os 500ms do crossfade até 2750ms (término e desmontagem completa)
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(container.firstChild).toBeNull();
  });
});
