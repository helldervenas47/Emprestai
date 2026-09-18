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

  it("completa o ciclo de animação chamando onStartExit aos 1380ms e onFinish aos 1780ms", () => {
    const onStartExit = vi.fn();
    const onFinish = vi.fn();
    const { container } = render(<SplashScreen onStartExit={onStartExit} onFinish={onFinish} />);

    expect(onStartExit).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();

    // Avança para 1200ms (término da animação da logo -> início da estabilização de 180ms)
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onStartExit).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();

    // Avança 180ms até 1380ms (início do crossfade simultâneo de 400ms)
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(onStartExit).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();

    // Avança os 400ms do crossfade até 1780ms (término e desmontagem completa)
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(container.firstChild).toBeNull();
  });
});
