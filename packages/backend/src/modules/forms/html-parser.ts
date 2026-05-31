import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import type {
  FormField,
  FormFieldOption,
  FormFieldValidation,
  ParsedForm,
  JSONSchema,
  JSONSchemaProperty,
} from './form.types.js';

const ALLOWED_TAGS = [
  'form',
  'input',
  'select',
  'textarea',
  'option',
  'optgroup',
  'label',
  'fieldset',
  'legend',
  'button',
  'datalist',
  'output',
  'div',
  'span',
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'strong',
  'em',
  'small',
  'a',
  'img',
];

const ALLOWED_ATTRS = [
  'class',
  'id',
  'style',
  'name',
  'type',
  'value',
  'placeholder',
  'required',
  'disabled',
  'readonly',
  'checked',
  'selected',
  'multiple',
  'min',
  'max',
  'minlength',
  'maxlength',
  'pattern',
  'step',
  'rows',
  'cols',
  'for',
  'action',
  'method',
  'enctype',
  'accept',
  'autocomplete',
  'autofocus',
  'tabindex',
  'title',
  'aria-label',
  'aria-describedby',
  'aria-required',
  'role',
  'href',
  'src',
  'alt',
  'width',
  'height',
];

export class HTMLParser {
  /**
   * Parse HTML and extract form structure
   */
  static parse(html: string): ParsedForm {
    const sanitizedHtml = HTMLParser.sanitize(html);
    const fields = HTMLParser.extractFields(sanitizedHtml);
    return { fields, sanitizedHtml };
  }

  /**
   * Remove scripts, event handlers, iframes, object, embed, and potentially dangerous elements.
   * Only allow form-related tags and styles.
   */
  static sanitize(html: string): string {
    const window = new JSDOM('').window;
    const purify = DOMPurify(window as any);

    const clean = purify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRS,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'applet', 'base', 'link', 'meta'],
      FORBID_ATTR: [
        'onclick',
        'ondblclick',
        'onmousedown',
        'onmouseup',
        'onmouseover',
        'onmousemove',
        'onmouseout',
        'onkeypress',
        'onkeydown',
        'onkeyup',
        'onload',
        'onerror',
        'onunload',
        'onabort',
        'onblur',
        'onchange',
        'onfocus',
        'onreset',
        'onsubmit',
        'onselect',
      ],
      ALLOW_DATA_ATTR: false,
    });

    return clean;
  }

  /**
   * Extract field metadata from HTML.
   * For each <input>, <select>, <textarea> element, extract metadata.
   * Validates all fields have unique name attributes.
   */
  static extractFields(html: string): FormField[] {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const fields: FormField[] = [];
    const fieldElements = document.querySelectorAll('input, select, textarea');

    for (const element of fieldElements) {
      const name = element.getAttribute('name');
      if (!name) continue;

      const field = HTMLParser.extractFieldMetadata(element, document);
      if (field) {
        fields.push(field);
      }
    }

    // Validate unique names
    const names = fields.map((f) => f.name);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      throw new Error(`Duplicate field names found: ${[...new Set(duplicates)].join(', ')}`);
    }

    return fields;
  }

  /**
   * Generate a JSON Schema object from extracted fields.
   */
  static generateSchema(fields: FormField[]): JSONSchema {
    const properties: Record<string, JSONSchemaProperty> = {};
    const required: string[] = [];

    for (const field of fields) {
      properties[field.name] = HTMLParser.fieldToSchemaProperty(field);
      if (field.required) {
        required.push(field.name);
      }
    }

    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties,
      required,
    };
  }

  private static extractFieldMetadata(
    element: Element,
    document: Document,
  ): FormField | null {
    const name = element.getAttribute('name');
    if (!name) return null;

    const tagName = element.tagName.toLowerCase();
    let type: string;

    if (tagName === 'select') {
      type = 'select';
    } else if (tagName === 'textarea') {
      type = 'textarea';
    } else {
      type = element.getAttribute('type') || 'text';
    }

    const required = element.hasAttribute('required');
    const label = HTMLParser.findLabel(element, document);
    const options = HTMLParser.extractOptions(element, type);
    const validation = HTMLParser.extractValidation(element);

    const field: FormField = {
      name,
      type,
      required,
    };

    if (label) field.label = label;
    if (options && options.length > 0) field.options = options;
    if (validation && Object.keys(validation).length > 0) field.validation = validation;

    return field;
  }

  private static findLabel(element: Element, document: Document): string | undefined {
    // Check for associated <label> via 'for' attribute
    const id = element.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label && label.textContent) {
        return label.textContent.trim();
      }
    }

    // Check for wrapping <label>
    const parentLabel = element.closest('label');
    if (parentLabel) {
      // Get text content excluding the input element itself
      const clone = parentLabel.cloneNode(true) as Element;
      const inputs = clone.querySelectorAll('input, select, textarea');
      inputs.forEach((input) => input.remove());
      const text = clone.textContent?.trim();
      if (text) return text;
    }

    // Fall back to placeholder
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;

    return undefined;
  }

  private static extractOptions(element: Element, type: string): FormFieldOption[] | undefined {
    if (type === 'select') {
      const options: FormFieldOption[] = [];
      const optionElements = element.querySelectorAll('option');
      for (const opt of optionElements) {
        const value = opt.getAttribute('value');
        if (value === null || value === '') continue; // Skip placeholder options
        options.push({
          value,
          label: opt.textContent?.trim() || value,
        });
      }
      return options.length > 0 ? options : undefined;
    }

    if (type === 'radio') {
      // For radio buttons, we need to find all radios with the same name
      const name = element.getAttribute('name');
      if (!name) return undefined;

      const document = element.ownerDocument;
      const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
      const options: FormFieldOption[] = [];

      for (const radio of radios) {
        const value = radio.getAttribute('value');
        if (!value) continue;

        // Try to find label for this radio
        const id = radio.getAttribute('id');
        let label = value;
        if (id) {
          const labelEl = document.querySelector(`label[for="${id}"]`);
          if (labelEl && labelEl.textContent) {
            label = labelEl.textContent.trim();
          }
        }
        options.push({ value, label });
      }

      return options.length > 0 ? options : undefined;
    }

    return undefined;
  }

  private static extractValidation(element: Element): FormFieldValidation | undefined {
    const validation: FormFieldValidation = {};

    const pattern = element.getAttribute('pattern');
    if (pattern) validation.pattern = pattern;

    const min = element.getAttribute('min');
    if (min) validation.min = Number(min);

    const max = element.getAttribute('max');
    if (max) validation.max = Number(max);

    const minlength = element.getAttribute('minlength');
    if (minlength) validation.minlength = Number(minlength);

    const maxlength = element.getAttribute('maxlength');
    if (maxlength) validation.maxlength = Number(maxlength);

    return Object.keys(validation).length > 0 ? validation : undefined;
  }

  private static fieldToSchemaProperty(field: FormField): JSONSchemaProperty {
    const prop: JSONSchemaProperty = { type: 'string' };

    switch (field.type) {
      case 'number':
      case 'range':
        prop.type = 'number';
        if (field.validation?.min !== undefined) prop.minimum = field.validation.min;
        if (field.validation?.max !== undefined) prop.maximum = field.validation.max;
        break;

      case 'checkbox':
        prop.type = 'boolean';
        break;

      case 'date':
        prop.type = 'string';
        prop.format = 'date';
        break;

      case 'datetime-local':
        prop.type = 'string';
        prop.format = 'date-time';
        break;

      case 'email':
        prop.type = 'string';
        prop.format = 'email';
        break;

      case 'url':
        prop.type = 'string';
        prop.format = 'uri';
        break;

      case 'select':
        prop.type = 'string';
        if (field.options && field.options.length > 0) {
          prop.enum = field.options.map((o) => o.value);
        }
        break;

      case 'file':
        prop.type = 'string';
        break;

      default:
        prop.type = 'string';
        if (field.validation?.pattern) prop.pattern = field.validation.pattern;
        if (field.validation?.minlength !== undefined) prop.minLength = field.validation.minlength;
        if (field.validation?.maxlength !== undefined) prop.maxLength = field.validation.maxlength;
        break;
    }

    return prop;
  }
}
