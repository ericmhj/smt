'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

interface ValidationError {
  fieldName: string;
  sectionName: string;
  ruleName: string;
  message: string;
  ruleType: 'global' | 'custom';
}

interface EnsayoFormModalProps {
  reactivoId: string;
  htmlContent: string;
  initialResponses?: Record<string, unknown>;
  readOnly?: boolean;
  onClose: () => void;
  onSubmitSuccess: () => void;
}

export default function EnsayoFormModal({
  reactivoId,
  htmlContent,
  initialResponses,
  readOnly = false,
  onClose,
  onSubmitSuccess,
}: EnsayoFormModalProps) {
  const [opened, setOpened] = useState(false);
  const winRef = useRef<Window | null>(null);

  const openFormWindow = useCallback(() => {
    // Build the full standalone HTML with submit logic
    const token = localStorage.getItem('access_token') || '';
    const tenantSlug = window.location.hostname.split('.')[0] || 'default';
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const refreshToken = localStorage.getItem('refresh_token') || '';

    // Strip <form> tags to avoid conflicts
    let formHtml = htmlContent.replace(/<form[^>]*>/gi, '').replace(/<\/form>/gi, '');

    // Script de auto-refresco del token: mantiene window.__formToken vigente hasta
    // 6h renovándolo con el refresh_token antes de que el access_token (15 min)
    // expire. Así el formulario puede llenarse durante horas sin perder sesión.
    const tokenRefreshScript = `
<script>
(function() {
  window.__formToken = '${token}';
  var refreshToken = '${refreshToken}';
  var apiBase = '${apiBase}';
  var tenantSlug = '${tenantSlug}';
  var startedAt = Date.now();
  var MAX_MS = 6 * 60 * 60 * 1000; // 6 horas

  function refresh() {
    // Dejar de renovar tras 6h de sesión de formulario
    if (Date.now() - startedAt > MAX_MS) return;
    if (!refreshToken) return;
    fetch(apiBase + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
      body: JSON.stringify({ refreshToken: refreshToken })
    })
    .then(function(res){ return res.ok ? res.json() : null; })
    .then(function(data){
      if (data && data.accessToken) {
        window.__formToken = data.accessToken;
        if (data.refreshToken) refreshToken = data.refreshToken;
      }
    })
    .catch(function(){});
  }

  // Renovar cada 10 minutos (el access_token dura 15 min)
  setInterval(refresh, 10 * 60 * 1000);
})();
</script>`;

    // Inject initial values as a global variable BEFORE the form scripts run
    let initScript = '';
    if (initialResponses && Object.keys(initialResponses).length > 0) {
      initScript = `
<script>
// Pre-load saved responses as global for the form scripts to use at init time
window.__savedResponses = ${JSON.stringify(initialResponses)};
window.__isReadOnly = ${readOnly};
</script>`;
    }

    // Post-load script that fills values AFTER dynamic content is generated
    const postLoadScript = initialResponses && Object.keys(initialResponses).length > 0 ? `
<script>
window.addEventListener('load', function() {
  setTimeout(function() {
    var values = window.__savedResponses || {};
    
    // Fill all existing inputs
    for (var key in values) {
      var el = document.querySelector('[name="' + key + '"]');
      if (el) {
        el.value = String(values[key] || '');
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
      }
    }
    
    // Trigger NOM-025 calculations
    if (typeof calcularReglasNOM025 === 'function') calcularReglasNOM025();
    if (typeof initAllAreaBlocks === 'function') initAllAreaBlocks();
    
    // Wait for dynamic tables then fill again
    setTimeout(function() {
      for (var key in values) {
        var el = document.querySelector('[name="' + key + '"]');
        if (el && !el.value && values[key]) {
          el.value = String(values[key] || '');
        }
      }
      // Disable if readOnly
      if (window.__isReadOnly) {
        document.querySelectorAll('input,textarea,select').forEach(function(el){
          el.disabled=true; el.style.opacity='1'; el.style.color='#1e293b';
        });
      }
    }, 1000);
  }, 500);
});
</script>` : '';

    // Auto-save script (saves draft every 30 seconds)
    const autoSaveScript = readOnly ? '' : `
<script>
(function() {
  var saveTimer = null;
  var lastSaved = '';

  function collectAll() {
    var inputs = document.querySelectorAll('input,select,textarea');
    var r = {};
    inputs.forEach(function(el) {
      var n = el.getAttribute('name'); if(!n) return;
      if(el.type==='checkbox') r[n]=el.checked;
      else if(el.type==='radio'){if(el.checked)r[n]=el.value;}
      else if(el.type==='number') r[n]=el.value===''?null:Number(el.value);
      else r[n]=el.value;
    });
    document.querySelectorAll('input[type="hidden"]').forEach(function(el) {
      var n = el.getAttribute('name') || el.getAttribute('id');
      if(n && el.value) r[n] = el.value;
    });
    var pd = document.getElementById('plano-data');
    if (pd && pd.value) r['plano_areas_json'] = pd.value;
    // Canvas image
    try {
      var stage = window.Konva && Konva.stages && Konva.stages[0];
      if (stage) r['__canvas_image'] = stage.toDataURL({pixelRatio:1});
    } catch(e){}
    return r;
  }

  function saveDraft() {
    var r = collectAll();
    var json = JSON.stringify(r);
    if (json === lastSaved) return; // no changes
    lastSaved = json;
    fetch('${apiBase}/api/reactivos/${reactivoId}/draft', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+(window.__formToken||'${token}'),'X-Tenant-Slug':'${tenantSlug}'},
      body: JSON.stringify({responses: r})
    }).then(function() {
      var badge = document.querySelector('.autosave-badge');
      if (badge) { badge.classList.add('show'); setTimeout(function(){badge.classList.remove('show');},2000); }
    }).catch(function(){});
  }

  // Save every 30 seconds
  setInterval(saveDraft, 30000);
  // Also save on visibility change (user switching tabs)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) saveDraft();
  });
  // Save on beforeunload
  window.addEventListener('beforeunload', function() { saveDraft(); });
})();
</script>`;

    // Submit bar + logic
    const submitScript = readOnly ? `
<script>
document.addEventListener('DOMContentLoaded', function() {
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:2px solid #6b7280;padding:16px 24px;display:flex;gap:12px;justify-content:center;z-index:9999;box-shadow:0 -4px 12px rgba(0,0,0,0.1)';
  bar.innerHTML = '<button onclick="window.close()" style="background:#6b7280;color:white;border:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Cerrar</button>';
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '80px';
});
</script>` : `
<script>
document.addEventListener('DOMContentLoaded', function() {
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:2px solid #1a6b3a;padding:16px 24px;display:flex;gap:12px;justify-content:center;z-index:9999;box-shadow:0 -4px 12px rgba(0,0,0,0.1)';
  bar.innerHTML = '<button id="btn-submit" disabled style="background:#1a6b3a;color:white;border:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;opacity:0.5" title="Primero genere las secciones desde el plano de áreas">Enviar Ensayo</button><button id="btn-cancel" style="background:#6b7280;color:white;border:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Cancelar</button>';
  document.body.appendChild(bar);
  document.body.style.paddingBottom = '80px';
  // Enable submit if sections were already generated (e.g. from restored draft)
  setTimeout(function() {
    if (window.__sectionsValid || document.querySelectorAll('.area-block').length > 0) {
      var btn = document.getElementById('btn-submit');
      if(btn){btn.disabled=false;btn.style.opacity='1';}
    }
  }, 1500);

  document.getElementById('btn-cancel').onclick = function() { window.close(); };
  document.getElementById('btn-submit').onclick = function() {
    var btn = this; btn.textContent = 'Enviando...'; btn.disabled = true;
    
    // Force canvas data serialization by reading Konva layer directly
    try {
      var planoInput = document.getElementById('plano-data');
      if (planoInput && !planoInput.value) {
        // Try to serialize from Konva stage if available
        var stage = window.Konva && Konva.stages && Konva.stages[0];
        if (stage) {
          var layer = stage.getLayers()[stage.getLayers().length - 1];
          if (layer) {
            var areas = [];
            layer.find('.area-shape').forEach(function(s) {
              var d = s.getAttr('areaData') || {};
              areas.push({nombre:d.nombre||'',largo:d.largo||'',ancho:d.ancho||'',alto:d.alto||'',
                id:s.getAttr('areaId')||'',x:Math.round(s.x()),y:Math.round(s.y()),
                pixelW:Math.round(s.width()*s.scaleX()),pixelH:Math.round(s.height()*s.scaleY())});
            });
            if (areas.length > 0) planoInput.value = JSON.stringify(areas);
          }
        }
      }
    } catch(e) { console.log('Canvas serialize error:', e); }

    // Export canvas as PNG base64 using Konva stage API
    var canvasImage = '';
    try {
      var stage = window.Konva && Konva.stages && Konva.stages[0];
      if (stage) {
        canvasImage = stage.toDataURL({ pixelRatio: 2 });
      }
    } catch(e) { console.log('Canvas export error:', e); }
    
    // Collect ALL inputs including dynamically generated ones
    var inputs = document.querySelectorAll('input,select,textarea');
    var r = {};
    inputs.forEach(function(el) {
      var n = el.getAttribute('name'); if(!n) return;
      if(el.type==='checkbox') r[n]=el.checked;
      else if(el.type==='radio'){if(el.checked)r[n]=el.value;}
      else if(el.type==='number') r[n]=el.value===''?null:Number(el.value);
      else r[n]=el.value;
    });
    // Capture hidden inputs (plano-data, etc)
    document.querySelectorAll('input[type="hidden"]').forEach(function(el) {
      var n = el.getAttribute('name') || el.getAttribute('id');
      if(n && el.value) r[n] = el.value;
    });
    // Store canvas image and plano data
    if (canvasImage) r['__canvas_image'] = canvasImage;
    var pd = document.getElementById('plano-data');
    if (pd && pd.value) r['plano_areas_json'] = pd.value;
    // Capture full rendered HTML for PDF (exact copy of what user sees)
    try {
      // 1. Fijar en ATRIBUTOS los valores en vivo de los campos de formulario.
      //    cloneNode copia atributos, no propiedades (el.value); sin esto el
      //    "Informe No" y demás campos salen vacíos en el PDF.
      document.querySelectorAll('input[name]').forEach(function(el) {
        var t = el.getAttribute('type');
        if (t === 'checkbox' || t === 'radio') {
          if (el.checked) el.setAttribute('checked', 'checked'); else el.removeAttribute('checked');
        } else {
          el.setAttribute('value', el.value != null ? el.value : '');
        }
      });
      document.querySelectorAll('textarea[name], textarea').forEach(function(el) {
        el.textContent = el.value != null ? el.value : '';
      });
      document.querySelectorAll('select[name]').forEach(function(el) {
        for (var i = 0; i < el.options.length; i++) {
          if (el.options[i].selected) el.options[i].setAttribute('selected', 'selected');
          else el.options[i].removeAttribute('selected');
        }
      });

      // 2. Clonar el documento
      var clone = document.documentElement.cloneNode(true);

      // 3. Reemplazar el canvas Konva (#konva-stage) por la imagen exportada del plano.
      //    Se mantiene la altura del contenedor para que la brújula (overlay
      //    position:absolute dentro de #plano-container) quede bien posicionada
      //    sobre la imagen y NO flote suelta en otra hoja.
      var stageHost = clone.querySelector('#konva-stage');
      if (stageHost) {
        if (canvasImage) {
          var img = document.createElement('img');
          img.setAttribute('src', canvasImage);
          img.setAttribute('style', 'width:100%;max-width:760px;height:auto;display:block;');
          stageHost.innerHTML = '';
          stageHost.appendChild(img);
        } else {
          stageHost.innerHTML = '';
        }
      }

      // 5. Quitar scripts y la barra fija de envío
      clone.querySelectorAll('script').forEach(function(s){ s.remove(); });
      var fixedBar = clone.querySelector('div[style*="position:fixed"]');
      if (fixedBar) fixedBar.remove();

      r['__rendered_html'] = clone.outerHTML;
    } catch(e) {}
    fetch('${apiBase}/api/reactivos/${reactivoId}/submit',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+(window.__formToken||'${token}'),'X-Tenant-Slug':'${tenantSlug}'},
      body:JSON.stringify({responses:r})
    })
    .then(function(res){if(!res.ok)return res.json().then(function(d){throw new Error(d.message||'Error')});return res.json();})
    .then(function(){
      document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;font-family:system-ui"><div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:32px">\\u2713</div><h2 style="color:#166534;margin:0">Ensayo enviado correctamente</h2><p style="color:#6b7280">Esta ventana se cerrara...</p></div>';
      setTimeout(function(){window.close();},2000);
    })
    .catch(function(err){alert('Error: '+err.message);btn.textContent='Enviar Ensayo';btn.disabled=false;});
  };
});
</script>`;

    // Build full HTML document
    const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${readOnly ? 'Ver Formulario' : 'Llenar Ensayo'}</title>
${tokenRefreshScript}
${initScript}
</head>
<body>${formHtml}${postLoadScript}${autoSaveScript}${submitScript}</body>
</html>`;

    // Open new window and write HTML
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(fullHtml);
      win.document.close();
      winRef.current = win;
      setOpened(true);

      // Poll for window close to trigger callback
      const interval = setInterval(() => {
        if (win.closed) {
          clearInterval(interval);
          onSubmitSuccess();
        }
      }, 1000);
    }
  }, [htmlContent, initialResponses, readOnly, reactivoId, onSubmitSuccess]);

  // Auto-open on mount
  useEffect(() => {
    if (!opened) {
      openFormWindow();
    }
  }, [opened, openFormWindow]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 text-center max-w-md">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          {readOnly ? 'Formulario abierto' : 'Formulario abierto en nueva ventana'}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {readOnly
            ? 'El formulario se abrió en una nueva pestaña. Ciérrela cuando termine.'
            : 'Complete el formulario en la nueva pestaña. Al enviar, esta vista se actualizará automáticamente.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={openFormWindow}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
          >
            Reabrir ventana
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
