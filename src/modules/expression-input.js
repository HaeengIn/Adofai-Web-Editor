import { CalculateExpression } from "./expression-calculator.js";

/**
 * Evaluate a mathematical expression when Enter is pressed.
 *
 * @param {KeyboardEvent} event
 */
function HandleExpressionInput(event) {
  if (event.key !== "Enter") {
    return;
  }

  const input = event.target;

  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  if (input.type !== "text" || !input.value.trim()) {
    return;
  }

  try {
    const result = CalculateExpression(input.value);

    input.value = String(result);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (error) {
    console.warn("Invalid mathematical expression:", error);
  }
}

export function InitExpressionInput() {
  document.addEventListener("keydown", HandleExpressionInput, true);
}
