import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FormModalOverlay } from "../form-modal-overlay";

describe("FormModalOverlay no mobile", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
    document.documentElement.style.overflow = "";
    document.getElementById("root")?.removeAttribute("inert");
  });

  it("bloqueia o fundo sem desativar gestos de rolagem dos portais", () => {
    document.body.innerHTML = '<div id="root"></div>';

    const view = render(
      <FormModalOverlay>
        <div>Formulário</div>
      </FormModalOverlay>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.touchAction).not.toBe("none");
    expect(document.getElementById("root")).toHaveAttribute("inert");

    view.unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.getElementById("root")).not.toHaveAttribute("inert");
  });
});
