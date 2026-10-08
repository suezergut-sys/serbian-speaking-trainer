import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WordHintToken } from "../WordHintToken";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([0, 290])("keeps hints inside a 320px viewport near word x=%s", (left) => {
  vi.stubGlobal("innerWidth", 320);
  vi.stubGlobal("innerHeight", 640);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return (this.classList.contains("word-tooltip")
      ? { left: 0, top: 0, width: 180, height: 42 }
      : { left, top: 200, bottom: 225, width: 30, height: 25 }) as DOMRect;
  });
  const onClick = vi.fn();
  const { container, rerender } = render(<WordHintToken word="грязную" used active disabled={false} translation="prljavu" onClick={onClick} />);
  const popup = screen.getByRole("status");
  expect(popup.parentElement).toBe(document.body);
  expect(container.querySelector(".word-tooltip")).toBeNull();
  expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(12);
  expect(parseFloat(popup.style.left) + 180).toBeLessThanOrEqual(308);
  expect(popup.style.top).toBe("148px");
  fireEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledOnce();
  rerender(<WordHintToken word="грязную" used active={false} disabled={false} translation="prljavu" onClick={onClick} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
