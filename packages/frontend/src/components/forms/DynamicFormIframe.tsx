'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface DynamicFormIframeProps {
  htmlContent: string;
  onSubmit: (responses: Record<string, unknown>) => void;
  submitting?: boolean;
}

export default function DynamicFormIframe({ htmlContent, onSubmit, submitting }: DynamicFormIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(800);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Inject a postMessage bridge into the HTML so we can communicate with the iframe
  const enhancedHtml = buildIframeHtml(htmlContent);

  // Listen for messages from the iframe (height updates, form data)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'iframe-height') {
        setIframeHeight(event.data.height + 40);
      }
      if (event.data?.type === 'iframe-error') {
        console.error('[Iframe Error]', event.data.error);
      }
      if (event.data?.type === 'form-data') {
        setValidationErrors([]);
        const errors: string[] = [];
        const responses = event.data.responses as Record<string, unknown>;

        // Check required fields
        if (event.data.requiredErrors?.length > 0) {
          errors.push(...event.data.requiredErrors);
        }

        if (errors.length > 0) {
          setValidationErrors(errors);
          return;
        }
        onSubmit(responses);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSubmit]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    // Tell iframe to collect and send form data
    iframeRef.current?.contentWindow?.postMessage({ type: 'collect-form-data' }, '*');
  }, []);

  return (
    <form onSubmit={handleSubmit} className="relative">
      {submitting && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50 rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600">Guardando formulario...</p>
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">
          <ul className="list-disc list-inside">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <iframe
        ref={iframeRef}
        srcDoc={enhancedHtml}
        style={{ width: '100%', height: `${iframeHeight}px`, border: 'none' }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
        title="Formulario"
      />

      <div className="flex gap-3 pt-4 border-t">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Enviar formulario'}
        </button>
      </div>
    </form>
  );
}

/**
 * Wraps the form HTML with a postMessage bridge script for parent-iframe communication.
 * - Reports height changes so the parent can resize the iframe
 * - Listens for 'collect-form-data' to gather all inputs and send back
 */
function buildIframeHtml(htmlContent: string): string {
  const bridgeScript = `
<script>
(function() {
  // Report errors to parent
  window.onerror = function(msg, url, line) {
    window.parent.postMessage({ type: 'iframe-error', error: msg + ' at ' + url + ':' + line }, '*');
  };

  // Report height to parent
  function reportHeight() {
    const h = document.documentElement.scrollHeight || document.body.scrollHeight;
    window.parent.postMessage({ type: 'iframe-height', height: h }, '*');
  }
  
  // Report height on load and on resize
  window.addEventListener('load', () => { setTimeout(reportHeight, 500); });
  window.addEventListener('resize', reportHeight);
  new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true, attributes: true });

  // Listen for collect-form-data request from parent
  window.addEventListener('message', function(event) {
    if (event.data?.type === 'collect-form-data') {
      const inputs = document.querySelectorAll('input, select, textarea');
      const responses = {};
      const requiredErrors = [];

      inputs.forEach(function(input) {
        const name = input.getAttribute('name');
        if (!name) return;

        if (input.type === 'checkbox') {
          responses[name] = input.checked;
        } else if (input.type === 'radio') {
          if (input.checked) responses[name] = input.value;
        } else if (input.type === 'number' || input.type === 'range') {
          responses[name] = input.value === '' ? undefined : Number(input.value);
        } else {
          responses[name] = input.value;
        }

        if (input.hasAttribute('required') && !input.value) {
          requiredErrors.push('El campo "' + name + '" es obligatorio');
        }
      });

      window.parent.postMessage({ type: 'form-data', responses: responses, requiredErrors: requiredErrors }, '*');
    }
  });

  // Also report height periodically for dynamic content (Konva canvas, etc)
  setInterval(reportHeight, 2000);
})();
</script>`;

  // If the HTML has a </body> tag, inject before it; otherwise append
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', bridgeScript + '</body>');
  }
  return htmlContent + bridgeScript;
}
