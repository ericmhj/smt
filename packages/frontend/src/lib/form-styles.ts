/**
 * Original CSS styles for NOM-025 form templates.
 * Injected into form HTML via dangerouslySetInnerHTML.
 * Source: packages/backend/src/db/seed-data/formulario-nom025.html
 */
export const FORM_STYLES = `<style>
  :root {
    --green: #1a6b3a;
    --green-mid: #2e8b57;
    --green-light: #e8f5ee;
    --green-pale: #f4fbf7;
    --gray-900: #111827;
    --gray-700: #374151;
    --gray-500: #6b7280;
    --gray-300: #d1d5db;
    --gray-100: #f3f4f6;
    --white: #ffffff;
    --border: #d1d5db;
    --font-main: 'IBM Plex Sans', system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
  }
  .page { font-family: var(--font-main); font-size: 13px; color: var(--gray-900); max-width: 210mm; margin: 0 auto; padding: 24px 28px; }
  .page-header { border-bottom: 3px solid var(--green); padding: 14px 0 10px; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .company-name { font-size: 16px; font-weight: 600; color: var(--green); }
  .header-addr { font-size: 10px; color: var(--gray-500); line-height: 1.5; }
  .header-informe { font-size: 10px; font-weight: 600; color: var(--gray-700); text-align: right; font-family: var(--font-mono); }
  .section-heading { font-size: 13px; font-weight: 600; color: var(--gray-900); margin: 20px 0 12px; padding-left: 10px; border-left: 3px solid var(--green); }
  .subsection-heading { font-size: 12px; font-weight: 600; color: var(--gray-700); margin: 14px 0 8px; }
  .form-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .form-table td { border: 1px solid var(--border); padding: 7px 10px; vertical-align: middle; }
  .form-table td.label { background: var(--gray-100); font-weight: 500; font-size: 11.5px; color: var(--gray-700); width: 38%; }
  .form-table td.value { background: var(--white); }
  .form-table tr.header-row td { background: var(--green); color: var(--white); font-weight: 600; font-size: 12px; text-align: center; }
  .form-table tr.subheader-row td { background: var(--green-light); font-weight: 600; font-size: 11px; color: var(--green); text-align: center; }
  input[type="text"], input[type="number"], input[type="date"], input[type="time"], textarea, select {
    width: 100%; border: none; border-bottom: 1px solid var(--gray-300); padding: 4px 2px; font-size: 12px; font-family: var(--font-main); background: transparent; outline: none;
  }
  input:focus, textarea:focus, select:focus { border-bottom-color: var(--green); }
  textarea { min-height: 60px; resize: vertical; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px; }
  .data-table th { background: var(--green); color: var(--white); font-weight: 600; padding: 6px 5px; text-align: center; border: 1px solid rgba(255,255,255,.2); font-size: 10px; }
  .data-table td { border: 1px solid var(--border); padding: 4px; text-align: center; }
  .data-table td.row-num { background: var(--green-light); font-weight: 600; color: var(--green); font-family: var(--font-mono); font-size: 10px; width: 30px; }
  .data-table input { font-size: 10px; text-align: center; }
  .conclusion-box { background: var(--green); color: var(--white); padding: 8px 14px; font-weight: 600; font-size: 12px; }
  .firma-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 30px; }
  .firma-box { text-align: center; }
  .firma-line { border-bottom: 1.5px solid var(--gray-700); margin: 0 auto 6px; width: 80%; height: 40px; }
  .firma-label { font-size: 11px; font-weight: 600; color: var(--gray-700); }
  .norma-list { list-style: none; margin-bottom: 12px; }
  .norma-list li { padding: 8px 12px; margin-bottom: 6px; border-left: 3px solid var(--green); background: var(--green-pale); font-size: 12px; }
  .norma-list li strong { color: var(--green); }
  .nota-box { border: 1px solid var(--border); padding: 10px 14px; margin-bottom: 14px; background: var(--green-pale); font-size: 11px; line-height: 1.6; }
  .nota-title { font-weight: 700; color: var(--green); font-size: 12px; margin-bottom: 6px; }
  .divider { border: none; border-top: 1px solid var(--gray-300); margin: 16px 0; }
</style>`;
