/**
 * Safe arithmetic expression evaluator.
 * Supports: +, -, *, /, (), decimal numbers, and whitespace.
 * Does NOT use eval() or new Function() — uses recursive descent parsing.
 *
 * Grammar:
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := '-'? (number | '(' expression ')')
 *   number     := [0-9]+('.'[0-9]+)?
 */

export function safeMathEval(expr: string): number {
  // Remove whitespace
  const input = expr.replace(/\s+/g, '');

  // Validate characters (only digits, operators, parens, decimal points)
  if (!/^[\d+\-*/().]+$/.test(input)) {
    return NaN;
  }

  let pos = 0;

  function peek(): string {
    return input[pos] || '';
  }

  function consume(): string {
    return input[pos++] || '';
  }

  function parseExpression(): number {
    let result = parseTerm();

    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      if (op === '+') result += right;
      else result -= right;
    }

    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();

    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parseFactor();
      if (op === '*') result *= right;
      else {
        if (right === 0) return NaN; // Division by zero
        result /= right;
      }
    }

    return result;
  }

  function parseFactor(): number {
    // Handle unary minus
    if (peek() === '-') {
      consume();
      return -parseFactor();
    }

    // Handle parentheses
    if (peek() === '(') {
      consume(); // consume '('
      const result = parseExpression();
      if (peek() !== ')') return NaN; // Mismatched parens
      consume(); // consume ')'
      return result;
    }

    // Parse number
    return parseNumber();
  }

  function parseNumber(): number {
    const start = pos;
    while (pos < input.length && (input[pos] >= '0' && input[pos] <= '9' || input[pos] === '.')) {
      pos++;
    }

    if (pos === start) return NaN; // No number found

    const numStr = input.slice(start, pos);
    const value = Number(numStr);
    return isFinite(value) ? value : NaN;
  }

  const result = parseExpression();

  // Ensure we consumed the entire input
  if (pos !== input.length) return NaN;

  return isFinite(result) ? result : NaN;
}
