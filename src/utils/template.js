/**
 * Renders a template string by replacing {{variable}} placeholders
 * with values from the provided data object.
 *
 * @param {string} template - e.g. "Hi {{company}}, welcome!"
 * @param {Object} variables - e.g. { company: "Acme Corp" }
 * @returns {string} - e.g. "Hi Acme Corp, welcome!"
 *
 * @example
 * renderTemplate("Hi {{company}}", { company: "Acme" })
 * // => "Hi Acme"
 */
function renderTemplate(template, variables = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) {
      console.warn(`[Template] Warning: variable "{{${key}}}" not found in data.`);
      return match; // Leave the placeholder as-is if variable missing
    }
    return value;
  });
}

module.exports = { renderTemplate };
