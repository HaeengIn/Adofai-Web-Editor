/**
 * Safely evaluate a mathematical expression.
 *
 * Supported operators:
 * +, -, *, /, **
 * Parentheses and unary +/-
 *
 * @param {string} expression
 * @returns {number}
 */
export function CalculateExpression(expression) {
  const input = expression.replace(/\s+/g, "");

  if (!input) {
    throw new Error("Expression cannot be empty.");
  }

  let index = 0;

  function ParseExpression() {
    let value = ParseTerm();

    while (index < input.length) {
      const operator = input[index];

      if (operator !== "+" && operator !== "-") {
        break;
      }

      index++;

      const right = ParseTerm();
      value = operator === "+" ? value + right : value - right;
    }

    return value;
  }

  function ParseTerm() {
    let value = ParseUnary();

    while (index < input.length) {
      const operator = input[index];

      if (operator !== "*" && operator !== "/") {
        break;
      }

      // Exponentiation (**) has higher precedence than multiplication.
      if (operator === "*" && input[index + 1] === "*") {
        break;
      }

      index++;

      const right = ParseUnary();

      if (operator === "/" && right === 0) {
        throw new Error("Division by zero.");
      }

      value = operator === "*" ? value * right : value / right;
    }

    return value;
  }

  function ParseUnary() {
    if (input[index] === "+") {
      index++;
      return ParseUnary();
    }

    if (input[index] === "-") {
      index++;
      return -ParseUnary();
    }

    return ParsePower();
  }

  function ParsePower() {
    let value = ParsePrimary();

    if (input.slice(index, index + 2) === "**") {
      index += 2;

      // Right-associative exponentiation: 2**3**2 = 2**(3**2)
      const exponent = ParseUnary();
      value = value ** exponent;
    }

    return value;
  }

  function ParsePrimary() {
    if (input[index] === "(") {
      index++;

      const value = ParseExpression();

      if (input[index] !== ")") {
        throw new Error("Missing closing parenthesis.");
      }

      index++;
      return value;
    }

    const remaining = input.slice(index);
    const match = remaining.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);

    if (!match) {
      throw new Error(`Invalid expression at position ${index}.`);
    }

    index += match[0].length;

    return Number(match[0]);
  }

  const result = ParseExpression();

  if (index !== input.length) {
    throw new Error(`Unexpected character at position ${index}.`);
  }

  if (!Number.isFinite(result)) {
    throw new Error("Result is not a finite number.");
  }

  return result;
}
