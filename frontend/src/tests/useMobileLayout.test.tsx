import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMobileLayout } from "../useMobileLayout";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("tracks the visible browser viewport after loading and removes its listeners", () => {
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 700, offsetTop: 0 });
  const remove = vi.spyOn(viewport, "removeEventListener");
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  function Harness({ ready }: { ready: boolean }) {
    const { shell } = useMobileLayout(ready);
    return ready ? <div ref={shell} data-testid="shell" /> : null;
  }
  const rendered = render(<Harness ready={false} />);
  rendered.rerender(<Harness ready />);
  expect(screen.getByTestId("shell").style.getPropertyValue("--mobile-height")).toBe("700px");
  act(() => { Object.assign(viewport, { height: 340, offsetTop: 10 }); viewport.dispatchEvent(new Event("resize")); });
  expect(screen.getByTestId("shell").style.getPropertyValue("--mobile-height")).toBe("340px");
  expect(screen.getByTestId("shell").style.getPropertyValue("--mobile-top")).toBe("10px");
  expect(screen.getByTestId("shell")).toHaveClass("mobile-web-shell--short");
  rendered.unmount();
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
});
