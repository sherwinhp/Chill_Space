const assert = require("assert");
const {
  detectCardBrand,
  validateCardNumber,
  validateExpiry,
  validateCvv,
} = require("../services/stripe");

function expectOk(result, label) {
  assert.ok(result && result.ok, `${label} should be ok`);
}

function expectFail(result, label) {
  assert.ok(result && !result.ok, `${label} should fail`);
}

// Brand detection + Luhn
expectOk(validateCardNumber("4242 4242 4242 4242"), "Visa");
assert.strictEqual(detectCardBrand("4242 4242 4242 4242"), "visa");

expectOk(validateCardNumber("5555 5555 5555 4444"), "Mastercard");
assert.strictEqual(detectCardBrand("5555 5555 5555 4444"), "mastercard");

expectOk(validateCardNumber("378282246310005"), "Amex");
assert.strictEqual(detectCardBrand("378282246310005"), "amex");

expectOk(validateCardNumber("6011111111111117"), "Discover");
assert.strictEqual(detectCardBrand("6011111111111117"), "discover");

expectFail(validateCardNumber("4242 4242 4242 4241"), "Luhn failure");

// Expiry validation
const nextYear = new Date().getFullYear() + 1;
expectOk(validateExpiry(12, nextYear), "Future expiry");
const lastYear = new Date().getFullYear() - 1;
expectFail(validateExpiry(1, lastYear), "Past expiry");

// CVV length by brand
expectOk(validateCvv("123", "visa"), "Visa CVV");
expectOk(validateCvv("1234", "amex"), "Amex CVV");
expectFail(validateCvv("12", "visa"), "Short CVV");
expectFail(validateCvv("123", "amex"), "Amex short CVV");

console.log("cardValidation.test.js passed");
